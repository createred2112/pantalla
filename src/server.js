'use strict';
// Servidor del panel de admin (móvil) + API REST.
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const { cfg, paths, env, ensureDirs, ROOT, abs } = require('./config');
const sharp = require('sharp');
const store = require('./store');
const log = require('./util/logger');
const status = require('./util/status');
const auditLog = require('./util/auditLog');
const operationLog = require('./util/operationLog');
const pipelineLock = require('./util/pipelineLock');
const { renderToBuffer } = require('./generator/renderCard');
const { publish } = require('./pipeline/publish');
const { importWorker } = require('./pipeline/importWorker');
const auth = require('./auth');
const rundown = require('./rundown');
const renderGuard = require('./util/renderGuard');

// RED DE SEGURIDAD DEL PROCESO (F1): un error suelto en una promesa (p. ej.
// un hipo de Chromium durante una publicación en segundo plano) NO puede
// tumbar el panel entero. Se registra con su pila y el servidor sigue; cada
// etapa del pipeline ya reporta sus propios fallos por su canal.
// (Pendiente F2/F3: capturar en origen los listeners de puppeteer en
// htmlRender/video, que es de donde escapan estos rechazos.)
process.on('unhandledRejection', (reason) => {
  const msg = reason && reason.stack ? reason.stack : String(reason);
  try { log.error('proceso', 'Promesa sin capturar (el panel sigue en pie): ' + msg); } catch {}
});
process.on('uncaughtException', (err) => {
  try { log.error('proceso', 'Excepción sin capturar (el panel sigue en pie): ' + (err && err.stack || err)); } catch {}
});

ensureDirs();
const app = express();
app.set('trust proxy', 1); // detrás del proxy de CloudPanel (https + IP real)
app.use(express.json({ limit: '2mb' }));

const PUBLIC = path.join(__dirname, '..', 'public');
const clientIp = (req) => req.ip || req.socket.remoteAddress || 'unknown';

// --- Rutas públicas (sin sesión): login y sus recursos ---
app.get('/login', (req, res) => res.sendFile(path.join(PUBLIC, 'login.html')));
app.get('/login.html', (req, res) => res.sendFile(path.join(PUBLIC, 'login.html')));
app.get('/app.css', (req, res) => res.sendFile(path.join(PUBLIC, 'app.css')));

app.post('/api/login', (req, res) => {
  const ip = clientIp(req);
  if (!auth.throttle(ip)) {
    return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos.' });
  }
  const { user, password } = req.body || {};
  const ok = auth.verifyCredentials(user, password);
  if (!ok) {
    auth.noteFailure(ip);
    log.warn('auth', `Login fallido (${user}) desde ${ip}`);
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }
  auth.noteSuccess(ip);
  auth.setSessionCookie(req, res, auth.createToken(ok));
  log.info('auth', `Login OK: ${ok} desde ${ip}`);
  res.json({ ok: true, user: ok, mode: auth.modeOf(ok), simpleMode: auth.modeOf(ok) === 'simple' });
});

app.post('/api/logout', (req, res) => {
  auth.clearSessionCookie(res);
  res.json({ ok: true });
});

// Estado de autenticación / si hay administradores creados.
const PKG = require('../package.json');
app.get('/api/whoami', (req, res) => {
  const u = auth.userOf(req);
  res.json({
    authenticated: Boolean(u),
    user: u ? u.user : null,
    mode: u ? (u.mode || 'full') : null,
    simpleMode: Boolean(u && u.simpleMode),
    hasAdmins: auth.hasAdmins(),
    version: PKG.version,
    // Huella actual de la interfaz: si difiere de la que tiene la página
    // abierta, el panel enseña el banner "Actualizar" (ver public/app.js).
    assets: typeof assetsFingerprint === 'function' ? assetsFingerprint() : null,
  });
});

// --- Muro de autenticación para todo lo demás ---
app.use((req, res, next) => {
  const u = auth.userOf(req);
  if (u) {
    if (u.simpleMode && (req.path === '/editor.html' || req.path === '/galeria.html')) {
      return res.redirect('/');
    }
    return next();
  }
  // Petición de API -> 401 JSON; navegación -> redirección a /login.
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'no autenticado' });
  if (req.accepts('html')) return res.redirect('/login');
  return res.status(401).end();
});

// A partir de aquí, todo requiere sesión válida.

// HUELLA DE CONTENIDO (F2): cada asset del panel se referencia como
// archivo.js?v=<hash-de-su-contenido>. Si el archivo cambia, cambia la URL:
// ningún navegador ni PWA puede quedarse con JavaScript viejo por caché.
// (El ?v por versión de paquete se quedaba corto: un cambio sin subir la
// versión no invalidaba nada.)
const crypto = require('crypto');
const _assetHashes = new Map(); // archivo -> { mtimeMs, hash }
function assetHash(file) {
  try {
    const full = path.join(PUBLIC, file);
    const st = fs.statSync(full);
    const rec = _assetHashes.get(file);
    if (rec && rec.mtimeMs === st.mtimeMs) return rec.hash;
    const hash = crypto.createHash('sha1').update(fs.readFileSync(full)).digest('hex').slice(0, 10);
    _assetHashes.set(file, { mtimeMs: st.mtimeMs, hash });
    return hash;
  } catch { return PKG.version; }
}

// Huella CONJUNTA de la interfaz: si cualquier pieza cambia tras un deploy,
// la huella cambia y el panel abierto enseña el aviso "Actualizar".
function assetsFingerprint() {
  const files = ['index.html', 'app.js', 'editor.html', 'editor.js', 'review.html', 'review.js', 'galeria.html', 'espejo.html', 'sw.js'];
  return crypto.createHash('sha1')
    .update(files.map((f) => assetHash(f)).join('|') + PKG.version)
    .digest('hex').slice(0, 10);
}

function sendVersionedHtml(res, file) {
  const full = path.join(PUBLIC, file);
  if (!fs.existsSync(full)) return res.status(404).end();
  const html = fs.readFileSync(full, 'utf8')
    .replace(/src="([^":]+\.js)"/g, (m, src) => `src="${src}?v=${assetHash(src)}"`)
    .replace(/href="([^":]+\.css)"/g, (m, href) => `href="${href}?v=${assetHash(href)}"`)
    // La página sabe con qué huella nació: el aviso de actualización compara
    // esto contra /api/whoami cuando la PWA vuelve a primer plano.
    .replace('<head>', `<head><script>window.PANTALLA_CLIENT={version:${JSON.stringify(PKG.version)},assets:${JSON.stringify(assetsFingerprint())}}</script>`);
  res.setHeader('Cache-Control', 'no-cache, must-revalidate'); // el HTML, jamás cacheado
  res.type('html').send(html);
}

app.get(['/', '/index.html'], (req, res) => sendVersionedHtml(res, 'index.html'));
app.get('/review.html', (req, res) => sendVersionedHtml(res, 'review.html'));
app.get('/editor.html', (req, res) => sendVersionedHtml(res, 'editor.html'));
app.get('/galeria.html', (req, res) => sendVersionedHtml(res, 'galeria.html'));

// Política de caché (F2):
// - HTML, sw.js y manifest: SIEMPRE revalidados (no-cache).
// - JS/CSS pedidos CON huella (?v=hash): cacheables un año e inmutables — la
//   URL cambia cuando cambia el contenido, así que nunca pueden quedar viejos.
// - JS/CSS sin huella: no-cache (por si algo los referencia a pelo).
app.use(express.static(PUBLIC, {
  setHeaders: (res, filePath) => {
    const req = res.req || {};
    const name = path.basename(filePath);
    if (/\.(html|webmanifest)$/i.test(filePath) || name === 'sw.js') {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    } else if (/\.(js|css)$/i.test(filePath)) {
      const v = req.query && req.query.v;
      res.setHeader('Cache-Control', v && v === assetHash(name)
        ? 'public, max-age=31536000, immutable'
        : 'no-cache, must-revalidate');
    }
  },
}));
app.use('/media/uploads', express.static(paths.uploads));
app.use('/media/inbox', express.static(paths.workerInbox));
app.use('/media/output', express.static(paths.output));
app.use('/media/publish', express.static(paths.publish));
app.use('/media/last-tanda', express.static(require('./pipeline/sequence').LAST_TANDA_DIR));
app.use('/media/emisiones', express.static(require('./util/emisiones').DIR));
app.use('/fonts', express.static(path.join(__dirname, '..', 'assets', 'fonts')));
app.get('/media/project-videos/:name', (req, res) => {
  const name = path.basename(req.params.name || '');
  if (!/^[A-Za-z0-9_.-]+\.mp4$/i.test(name)) return res.status(404).end();
  const full = path.join(ROOT, name);
  if (!fs.existsSync(full)) return res.status(404).end();
  res.sendFile(full);
});

function safeUploadName(file) {
  const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
  const rawBase = path.basename(file.originalname || 'archivo', ext);
  const base = rawBase
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42) || 'archivo';
  return `${base}-${Date.now()}${ext}`;
}

function videoLibraryLabel(name, st) {
  if (!/^up_\d{10,}\.mp4$/i.test(name)) return name;
  const stamp = Number((/^up_(\d{10,})\.mp4$/i.exec(name) || [])[1]);
  const d = Number.isFinite(stamp) ? new Date(stamp) : st.mtime;
  return 'Vídeo subido ' + d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// --- Subida de fotos (desde el móvil) ---
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, paths.uploads),
    filename: (req, file, cb) => {
      cb(null, safeUploadName(file));
    },
  }),
  limits: { fileSize: 250 * 1024 * 1024 },
});

// --- API ---
const templates = require('./generator/templates');
const autopublish = require('./autopublish');
const notify = require('./util/notify');

// PUBLICACIÓN AUTOMÁTICA AL GUARDAR: cualquier cambio que toca la emisión
// reprograma una subida con colchón (90s). Se activa en Ajustes.
const AUTOPUBLISH_ROUTES = /^\/api\/(cards|rundown|agenda\/quick|settings|templates)/;
const AUTOPUBLISH_EXCLUDE = /\/(render|preview|ftp-test)/;
app.use((req, res, next) => {
  if (!/^(POST|PUT|DELETE)$/.test(req.method) || !AUTOPUBLISH_ROUTES.test(req.path) || AUTOPUBLISH_EXCLUDE.test(req.path)) return next();
  res.on('finish', () => {
    if (res.statusCode < 400) {
      try { autopublish.schedule(`${req.method} ${req.path}`); } catch {}
    }
  });
  next();
});

// Estado de la emisión: qué hay publicado, tanda anterior y espejo.
app.get('/api/tanda', (req, res) => {
  const seq = require('./pipeline/sequence');
  const pub = fs.existsSync(paths.publish)
    ? fs.readdirSync(paths.publish).filter((f) => f.toLowerCase().endsWith('.mp4')).sort()
    : [];
  let publishedAt = null;
  try { publishedAt = JSON.parse(fs.readFileSync(path.join(seq.LAST_TANDA_DIR, 'manifest.json'), 'utf8')).publishedAt; } catch {}
  res.json({
    files: pub.map((f) => ({ file: f, url: '/media/publish/' + encodeURIComponent(f) })),
    published: seq.lastTandaManifest(),
    publishedAt,
    hasPrevious: fs.existsSync(paths.publish + '-anterior'),
    autopublish: autopublish.state(),
  });
});

// ROLLBACK: vuelve a la tanda anterior y la sube a la pantalla.
app.post('/api/tanda/rollback', async (req, res) => {
  const prevDir = paths.publish + '-anterior';
  if (!fs.existsSync(prevDir)) return res.status(400).json({ error: 'No hay tanda anterior guardada todavía' });
  try {
    const up = await pipelineLock.withLock('Rollback de emisión', async () => {
      const tmp = paths.publish + '-tmp-rollback';
      fs.rmSync(tmp, { recursive: true, force: true });
      if (fs.existsSync(paths.publish)) fs.renameSync(paths.publish, tmp);
      fs.renameSync(prevDir, paths.publish);
      if (fs.existsSync(tmp)) fs.renameSync(tmp, prevDir); // la actual pasa a ser "anterior"
      return require('./pipeline/upload').upload({ source: 'manual-rollback' });
    });
    log.info('publish', `Rollback a la tanda anterior ${up.ok ? 'subido a pantalla' : 'con error: ' + (up.error || '')}`);
    res.json({ ok: up.ok !== false, upload: up });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// TAKEOVER urgente: la alerta ocupa la pantalla X minutos y vuelve sola.
app.get('/api/takeover', (req, res) => res.json(require('./takeover').state()));
app.post('/api/takeover', (req, res) => {
  const b = req.body || {};
  const r = require('./takeover').activate({ title: b.title, body: b.body, theme: b.theme, minutes: b.minutes, mode: b.mode });
  if (!r.ok) return res.status(400).json(r);
  res.json(r);
});
app.post('/api/takeover/off', (req, res) => res.json(require('./takeover').deactivate('manual')));

// HISTORIAL DE EMISIONES: listar y restaurar cualquier día.
app.get('/api/emisiones', (req, res) => res.json({ items: require('./util/emisiones').list() }));
app.post('/api/emisiones/:id/restore', async (req, res) => {
  try {
    const out = await pipelineLock.withLock('Restauración de emisión', async () => {
      const r = require('./util/emisiones').restore(req.params.id);
      if (!r.ok) return r;
      const up = await require('./pipeline/upload').upload({ source: 'manual-restore' });
      return { ...r, upload: up, ok: up.ok !== false };
    });
    if (!out.ok) return res.status(400).json(out);
    log.info('publish', `Emisión ${req.params.id} restaurada y subida`);
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Avisos push: clave pública, alta de dispositivo y prueba.
app.get('/api/push/key', (req, res) => res.json({ key: notify.publicKey(), devices: notify.count() }));
app.post('/api/push/subscribe', (req, res) => res.json(notify.subscribe(req.body || {})));
app.post('/api/push/test', async (req, res) => res.json(await notify.notify('Prueba de avisos', 'Así llegarán los avisos de LA PANTALLA a este móvil.', 'test')));
app.get('/api/config', (req, res) => {
  res.json({
    screen: cfg.screen,
    screenProfile: cfg.screenProfile || {},
    naming: cfg.naming || {},
    brand: cfg.brand,
    defaults: cfg.defaults,
    design: cfg.design || { version: 'v1' },
    templates: templates.list(),
    palette: cfg.palette || {},
    templateBumpers: cfg.templateBumpers || {},
    safety: renderGuard.safetyInfo(),
  });
});

// Fuentes disponibles (familias empaquetadas en assets/fonts).
function fontFamilies() {
  try {
    const dir = path.join(__dirname, '..', 'assets', 'fonts');
    const fams = new Set();
    for (const f of fs.readdirSync(dir)) {
      const m = f.match(/^([A-Za-z0-9]+)-\d+\.(ttf|otf)$/i);
      if (m) fams.add(m[1]);
    }
    return [...fams];
  } catch { return ['Anton', 'Oswald', 'Archivo']; }
}

const renderMeta = require('./util/renderMeta');
const mediaDuration = require('./util/mediaDuration');

function renderedCandidates(card) {
  if (!card || card.type !== 'generated') return null;
  const exts = card.video ? ['mp4', 'jpg', 'jpeg', 'png', 'webp'] : ['jpg', 'jpeg', 'png', 'webp', 'mp4'];
  const candidates = [];
  // Frescura por HASH de contenido: un archivo es válido si se generó con el
  // contenido actual de la cartela. (Fallback por fecha para renders antiguos
  // sin metadatos, de antes de esta versión.)
  const meta = renderMeta.get(card.id);
  const freshName = (() => {
    const f = renderMeta.isFresh(card);
    return f ? f.name : null;
  })();
  const updatedMs = card.updatedAt ? Date.parse(card.updatedAt) : 0;
  const legacyFresh = (st) => Boolean(!updatedMs || st.mtimeMs + 1000 >= updatedMs);
  const posterFile = path.join(paths.output, `${card.id}.jpg`);
  let poster = null;
  if (fs.existsSync(posterFile)) {
    const st = fs.statSync(posterFile);
    poster = { url: `/media/output/${encodeURIComponent(card.id)}.jpg?v=${Math.round(st.mtimeMs)}`, mtimeMs: st.mtimeMs };
  }
  for (const ext of exts) {
    const name = `${card.id}.${ext}`;
    const file = path.join(paths.output, name);
    if (!fs.existsSync(file)) continue;
    const st = fs.statSync(file);
    const fresh = meta ? name === freshName : legacyFresh(st);
    candidates.push({
      file: name,
      url: `/media/output/${encodeURIComponent(card.id)}.${ext}?v=${Math.round(st.mtimeMs)}`,
      ext,
      type: ext === 'mp4' ? 'video' : 'image',
      durationSeconds: ext === 'mp4' ? (meta && meta.file === name && meta.durationSeconds ? meta.durationSeconds : mediaDuration.roundedDuration(file)) : null,
      posterUrl: ext === 'mp4' && poster ? poster.url : null,
      stale: !fresh,
      mtimeMs: st.mtimeMs,
      mtime: st.mtime.toISOString(),
    });
  }
  return candidates;
}

function renderedInfo(card, opts = {}) {
  const candidates = renderedCandidates(card) || [];
  const current = candidates.find((item) => !item.stale);
  if (current) return current;
  if (!opts.includeStale) return null;
  return candidates.sort((a, b) => b.mtimeMs - a.mtimeMs)[0] || null;
}

// CSS @font-face de las fuentes empaquetadas (para el editor visual).
app.get('/api/fontcss', (req, res) => {
  const dir = path.join(__dirname, '..', 'assets', 'fonts');
  let css = '';
  try {
    for (const f of fs.readdirSync(dir)) {
      const m = f.match(/^([A-Za-z0-9]+)-(\d+)\.(ttf|otf)$/i);
      if (m) css += `@font-face{font-family:'${m[1]}';font-weight:${m[2]};src:url('/fonts/${f}') format('${m[3].toLowerCase() === 'otf' ? 'opentype' : 'truetype'}')}\n`;
    }
  } catch {}
  res.type('css').send(css);
});

// Ajustes de diseño: leer.
app.get('/api/settings', (req, res) => {
  const { ftpConfig } = require('./config');
  const ftp = cfg.ftp || {};
  const effectiveFtp = ftpConfig();
  delete effectiveFtp.password;
  res.json({
    brand: cfg.brand,
    palette: cfg.palette || {},
    screen: cfg.screen,
    screenProfile: cfg.screenProfile || {},
    naming: cfg.naming || {},
    design: cfg.design || { version: 'v1' },
    autopublish: cfg.autopublish || { enabled: false },
    templateBumpers: cfg.templateBumpers || {},
    ftp: { ...ftp, password: '', hasPassword: Boolean(ftp.password || process.env.FTP_PASSWORD), effective: effectiveFtp },
    fonts: fontFamilies(),
  });
});

// Ajustes generales: guardar. Se aplica en caliente.
app.put('/api/settings', (req, res) => {
  const { saveConfig } = require('./config');
  const body = req.body || {};
  const partial = {};
  if (body.brand) partial.brand = body.brand;
  if (body.palette) partial.palette = body.palette;
  if (body.screen) partial.screen = body.screen;
  if (body.screenProfile) partial.screenProfile = body.screenProfile;
  if (body.naming) partial.naming = body.naming;
  // Versión de diseño de las cartelas (v1 clásico / v2 letras gigantes).
  // Cambio en caliente y reversible: no toca layouts ni cachés de la otra versión.
  if (body.design && (body.design.version === 'v1' || body.design.version === 'v2')) {
    partial.design = { version: body.design.version };
  }
  // Publicación automática al guardar (modo confianza).
  if (body.autopublish) partial.autopublish = { enabled: body.autopublish.enabled === true };
  if (body.templateBumpers) partial.templateBumpers = body.templateBumpers;
  if (body.ftp) {
    const nextFtp = { ...(cfg.ftp || {}), ...body.ftp };
    if (!body.ftp.password) nextFtp.password = (cfg.ftp && cfg.ftp.password) || '';
    partial.ftp = nextFtp;
  }
  saveConfig(partial);
  log.info('settings', 'Ajustes de diseño actualizados', Object.keys(partial));
  res.json({ ok: true, brand: cfg.brand, palette: cfg.palette, screen: cfg.screen, screenProfile: cfg.screenProfile, naming: cfg.naming, templateBumpers: cfg.templateBumpers, ftp: { ...cfg.ftp, password: '' } });
});

// --- Fotos de la web (WordPress) para el banco "Fotos GasteizBerri" ---
// Lee la mediateca pública vía REST (wp-json/wp/v2/media). La base sale de
// brand.website; se puede forzar con config.wordpress.base.
function wpBase() {
  const forced = cfg.wordpress && cfg.wordpress.base;
  if (forced) return String(forced).replace(/\/+$/, '');
  const host = String(cfg.brand.website || 'gasteizberri.com').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return 'https://' + host;
}

app.get('/api/wp-media', async (req, res) => {
  try {
    const base = wpBase();
    const page = Math.max(1, Number(req.query.page) || 1);
    const search = String(req.query.search || '').trim();
    const u = new URL(base + '/wp-json/wp/v2/media');
    u.searchParams.set('per_page', '24');
    u.searchParams.set('page', String(page));
    u.searchParams.set('media_type', 'image');
    if (search) u.searchParams.set('search', search);
    const r = await fetch(u, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error('WordPress respondió ' + r.status);
    const totalPages = Math.max(1, Number(r.headers.get('x-wp-totalpages')) || 1);
    const items = (await r.json()).map((m) => {
      const sizes = (m.media_details && m.media_details.sizes) || {};
      const pick = (k) => sizes[k] && sizes[k].source_url;
      return {
        id: m.id,
        title: (m.title && m.title.rendered) || '',
        date: String(m.date || '').slice(0, 10),
        thumb: pick('medium_large') || pick('medium') || pick('thumbnail') || m.source_url,
        full: pick('large') || pick('full') || m.source_url,
      };
    }).filter((m) => m.thumb && m.full);
    res.json({ ok: true, base, page, totalPages, items });
  } catch (e) {
    res.status(502).json({ error: 'No se pudo leer la galería de la web: ' + e.message });
  }
});

// Descarga una foto de la web a data/uploads y devuelve su ruta local.
// Solo se aceptan URLs del propio WordPress (nada de hosts arbitrarios).
app.post('/api/wp-media/import', async (req, res) => {
  try {
    const url = String((req.body && req.body.url) || '').trim();
    const allowedHost = new URL(wpBase()).hostname;
    const target = new URL(url);
    const okHost = target.hostname === allowedHost || target.hostname.endsWith('.' + allowedHost);
    if (!okHost) return res.status(400).json({ error: 'La foto debe venir de ' + allowedHost });
    const photo = await require('./extract').downloadImage(url);
    if (!photo) return res.status(502).json({ error: 'No se pudo descargar la foto' });
    log.info('wp-media', `Foto importada de la web: ${url} → ${photo}`);
    res.json({ ok: true, photo });
  } catch (e) {
    res.status(400).json({ error: 'URL no válida: ' + e.message });
  }
});

app.get('/api/cards', (req, res) => {
  res.json(store.list().map((card) => {
    const rendered = renderedInfo(card);
    const staleRendered = rendered ? null : renderedInfo(card, { includeStale: true });
    const readyFileDuration = card.type === 'video' && card.file ? mediaDuration.roundedDuration(abs(card.file)) : null;
    const effectiveDuration = (rendered && rendered.durationSeconds) || readyFileDuration || (staleRendered && staleRendered.durationSeconds) || Number(card.duration) || null;
    return { ...card, rendered, staleRendered, effectiveDuration };
  }));
});

app.get('/api/rundown', (req, res) => {
  res.json(rundown.read({ date: req.query.date }));
});

app.put('/api/rundown', (req, res) => {
  res.json(rundown.save(req.body || {}, { date: req.query.date }));
});

app.put('/api/rundown/library', (req, res) => {
  res.json(rundown.saveLibrary(req.body || {}, { date: req.query.date }));
});

app.put('/api/rundown/day/:date', (req, res) => {
  res.json(rundown.saveDay(req.params.date, req.body || {}));
});

app.post('/api/rundown/reset', (req, res) => {
  res.json(rundown.reset());
});

app.post('/api/rundown/materialize', (req, res) => {
  const result = rundown.materialize({ date: (req.body && req.body.date) || req.query.date });
  log.info('rundown', `Escaleta generada: ${result.count} cartela(s)`);
  res.json(result);
});

// "PROPONME PIEZAS": sugerencias para los bancos (frases, datos, efemérides).
// Solo responde a demanda; sin sondeos ni carga de fondo (ver src/suggestions.js).
app.get('/api/banks/suggest', async (req, res) => {
  try {
    const key = String(req.query.key || '');
    const lib = rundown.read().library || {};
    const existing = (Array.isArray(lib[key]) ? lib[key] : []).map((it) => it.title);
    const r = await require('./suggestions').suggest(key, existing);
    if (!r.ok) return res.status(400).json(r);
    res.json(r);
  } catch (e) {
    res.status(502).json({ error: 'No se pudieron traer sugerencias: ' + e.message });
  }
});

// Agenda exprés: el flujo de cada mañana en un paso.
app.get('/api/agenda/quick', (req, res) => {
  res.json(rundown.quickAgenda(req.query.date));
});

// Sugerencias de eventos desde la propia web (fuente verificada): prueba
// The Events Calendar, luego tipos de contenido tipo agenda/evento del WP.
function stripHtml(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&#8211;|&ndash;/g, '–').replace(/&#8217;|&rsquo;/g, '’')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim();
}

app.get('/api/agenda/web', async (req, res) => {
  const day = String(req.query.date || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
  const base = wpBase();
  const items = [];
  let source = '';
  const seen = new Set();
  const push = (it) => {
    const title = stripHtml(it.title);
    if (!title || seen.has(title.toLowerCase())) return;
    seen.add(title.toLowerCase());
    // hora dentro del título ("19:30 Concierto...") si la fuente no la da
    const m = !it.time && title.match(/\b(\d{1,2})[:.](\d{2})\b/);
    items.push({
      title: m ? title.replace(m[0], '').replace(/\s+/g, ' ').trim() : title,
      time: it.time || (m ? `${String(m[1]).padStart(2, '0')}:${m[2]}` : ''),
      place: stripHtml(it.place || ''),
      url: it.url || '',
    });
  };
  // 0) KULTURKLIK (Open Data Euskadi): agenda cultural de Vitoria-Gasteiz.
  //    Una descarga al día por fecha, cacheada; el resto del día sale de disco.
  try {
    const kk = await require('./suggestions').kulturklik(day);
    for (const ev of kk.items || []) push({ title: ev.title, time: ev.time, place: [ev.place, ev.type].filter(Boolean).join(' · ') });
    if (items.length) source = 'Kulturklik / Euskadi.eus' + (kk.cached ? ' (caché de hoy)' : '');
  } catch (e) {
    log.warn('agenda', 'Kulturklik no disponible: ' + e.message);
  }
  // 1) The Events Calendar (plugin de eventos más común en WordPress)
  try {
    const u = new URL(base + '/wp-json/tribe/events/v1/events');
    u.searchParams.set('start_date', `${day} 00:00:00`);
    u.searchParams.set('end_date', `${day} 23:59:59`);
    u.searchParams.set('per_page', '30');
    const r = await fetch(u, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
    if (r.ok) {
      const j = await r.json();
      for (const ev of j.events || []) {
        push({ title: ev.title, time: String(ev.start_date || '').slice(11, 16), place: ev.venue && (ev.venue.venue || ev.venue.address), url: ev.url });
      }
      if (items.length && !source) source = 'calendario de eventos de la web';
    }
  } catch {}
  // 2) Tipos de contenido personalizados que suenen a agenda/evento
  if (!items.length) {
    try {
      const r = await fetch(base + '/wp-json/wp/v2/types', { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
      if (r.ok) {
        const types = Object.values(await r.json()).filter((t) => t && t.rest_base && /agenda|evento|event/i.test(`${t.slug} ${t.name || ''}`) && !/media|attachment/i.test(t.slug));
        for (const t of types) {
          const rr = await fetch(base + `/wp-json/wp/v2/${t.rest_base}?per_page=20&orderby=date&order=desc`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
          if (!rr.ok) continue;
          for (const p of await rr.json()) push({ title: p.title && p.title.rendered, url: p.link });
          if (items.length) { source = `contenido "${t.slug}" de la web`; break; }
        }
      }
    } catch {}
  }
  // 3) Últimas entradas que mencionen agenda (mejor que nada)
  if (!items.length) {
    try {
      const r = await fetch(base + '/wp-json/wp/v2/posts?search=agenda&per_page=10&orderby=date&order=desc', { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
      if (r.ok) {
        for (const p of await r.json()) push({ title: p.title && p.title.rendered, url: p.link });
        if (items.length) source = 'entradas recientes con "agenda"';
      }
    } catch {}
  }
  res.json({ ok: true, date: day, base, source, items: items.slice(0, 30) });
});

app.post('/api/agenda/quick', (req, res) => {
  try {
    const b = req.body || {};
    const r = rundown.quickAgendaSave(b.date, b.text, { theme: b.theme, hideExpired: b.hideExpired !== false, previewToday: b.previewToday === undefined ? undefined : b.previewToday === true });
    try { rundown.materialize({ date: r.date }); } catch (e) { log.warn('agenda', 'Exprés guardado pero no se pudo materializar: ' + e.message); }
    log.info('agenda', `Agenda exprés del ${r.date}: ${r.count} evento(s)`);
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/rundown/pick', (req, res) => {
  const body = req.body || {};
  res.json(rundown.pick(body.date || req.query.date, body.slotId, body.itemIndex, { fixed: body.fixed }));
});

// Frame resuelto de una cartela (para el editor visual): elementos posicionados.
app.get('/api/frame/:id', (req, res) => {
  const card = store.list().find((c) => c.id === req.params.id);
  if (!card) return res.status(404).json({ error: 'no existe' });
  try {
    const { resolveForEditor } = require('./generator/renderCard');
    const frame = resolveForEditor(card);
    if (!frame) return res.status(400).json({ error: 'plantilla no editable' });
    res.json(frame);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Guardar el diseño editado (layout) de una cartela. null = volver al de la plantilla.
// El layout queda etiquetado con la versión de diseño activa: así un diseño
// dibujado sobre v1 no tapa el v2 (ni al revés) y el rollback es limpio.
app.put('/api/cards/:id/layout', (req, res) => {
  const layout = req.body && req.body.layout ? { ...req.body.layout, design: templates.designVersion() } : null;
  const c = store.update(req.params.id, { layout });
  if (!c) return res.status(404).json({ error: 'no existe' });
  try { rundown.rememberCardEdit(c, { layout: c.layout }); } catch (e) { log.warn('rundown', `No se pudo recordar layout de ${req.params.id}: ${e.message}`); }
  log.info('editor', `Layout guardado en ${req.params.id}`);
  res.json({ ok: true });
});

// PLANTILLAS PROPIAS: guardar la composición del editor como plantilla nueva.
app.post('/api/templates/custom', (req, res) => {
  const b = req.body || {};
  const r = require('./userTemplates').create({ label: b.label, base: b.baseTemplate, layout: b.layout, theme: b.theme });
  if (!r.ok) return res.status(400).json(r);
  log.info('editor', `Plantilla propia creada: ${r.label} (${r.id})`);
  res.json(r);
});

app.delete('/api/templates/custom/:id', (req, res) => {
  const r = require('./userTemplates').remove(req.params.id);
  if (!r.ok) return res.status(400).json(r);
  log.info('editor', `Plantilla propia eliminada: ${req.params.id}`);
  res.json(r);
});

// Guardar un layout como PREDETERMINADO de una plantilla (afecta a todas sus cartelas).
app.put('/api/templates/:id/layout', (req, res) => {
  const theme = String((req.body && req.body.theme) || req.query.theme || '').trim();
  const clearThemes = !theme && req.body && req.body.clearThemes === true;
  require('./templateLayouts').set(req.params.id, theme, req.body && req.body.layout ? req.body.layout : null, { clearThemes });
  log.info('editor', `Layout predeterminado guardado en plantilla ${req.params.id}${theme ? ' / tema ' + theme : ''}${clearThemes ? ' / sin excepciones de color' : ''}`);
  res.json({ ok: true });
});

app.delete('/api/templates/:id/layout', (req, res) => {
  const theme = String(req.query.theme || '').trim();
  require('./templateLayouts').set(req.params.id, theme, null);
  log.info('editor', `Layout predeterminado restablecido en plantilla ${req.params.id}${theme ? ' / tema ' + theme : ''}`);
  res.json({ ok: true });
});

// Convertir una cartela en otro tipo de contenido (cartela-primero):
// manual ↔ dato automático (worker) ↔ carrusel (banco). La Escaleta se
// actualiza sola por debajo; el usuario no tiene que tocarla.
app.post('/api/cards/:id/convert', (req, res) => {
  try {
    const r = rundown.convertCard(req.params.id, req.body || {});
    if (!r.ok) return res.status(400).json(r);
    log.info('cards', `Cartela ${req.params.id} convertida a ${r.mode}${r.slotId ? ` (bloque ${r.slotId})` : ''}`);
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/cards', (req, res) => res.json(store.add(req.body)));

app.put('/api/cards/:id', (req, res) => {
  const c = store.update(req.params.id, req.body);
  if (!c) return res.status(404).json({ error: 'no existe' });
  try { rundown.rememberCardEdit(c, req.body || {}); } catch (e) { log.warn('rundown', `No se pudo recordar cambios de ${req.params.id}: ${e.message}`); }
  res.json(c);
});

app.delete('/api/cards/:id', (req, res) => {
  const card = store.list().find((c) => c.id === req.params.id);
  const ok = store.remove(req.params.id);
  let rundownSkip = null;
  if (ok) {
    try { rundownSkip = rundown.rememberCardDelete(card, req.query.date); } catch (e) { log.warn('rundown', `No se pudo recordar borrado de ${req.params.id}: ${e.message}`); }
    // Limpieza: renders huérfanos de la cartela borrada.
    try {
      for (const f of fs.readdirSync(paths.output)) {
        if (f.startsWith(req.params.id + '.')) fs.rmSync(path.join(paths.output, f), { force: true });
      }
      renderMeta.remove(req.params.id);
    } catch {}
  }
  res.json({ ok, skippedToday: Boolean(rundownSkip) });
});

app.post('/api/cards/:id/render', async (req, res) => {
  const card = store.list().find((c) => c.id === req.params.id);
  if (!card) return res.status(404).json({ error: 'no existe' });
  if (card.type !== 'generated') return res.status(400).json({ error: 'solo cartelas generadas' });
  const force = !(req.body && req.body.force === false);
  try {
    const out = await pipelineLock.withLock('Regeneración manual de cartela', async () => {
      // Por defecto el botón ⟳ regenera siempre; el editor puede pedir usar caché.
      status.set('generate', { ok: null, running: true, count: 1, done: 0, current: card.id, currentTitle: card.title || card.id, manual: true, results: [] });
      const r = await require('./pipeline/generate').renderOne(card, { force });
      try { await require('./generator/htmlRender').close(); } catch {}
      status.set('generate', { ok: true, running: false, count: 1, done: 1, current: null, manual: true, results: [{ id: card.id, file: r.file, ok: true, reused: r.reused, durationSeconds: r.durationSeconds || null }] });
      log.info('generate', `${r.reused ? 'Render manual reutilizado' : 'Render manual'} ${card.id} -> ${r.file}`);
      return { ok: true, file: r.file, reused: r.reused === true, rendered: renderedInfo(card) };
    }, { staleMs: 10 * 60 * 1000 });
    res.json(out);
  } catch (e) {
    try { await require('./generator/htmlRender').close(); } catch {}
    status.set('generate', { ok: false, running: false, count: 1, done: 0, current: null, manual: true, error: e.message, results: [{ id: card.id, ok: false, error: e.message }] });
    log.error('generate', `FALLO render manual ${card.id}: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/reorder', (req, res) => {
  const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids : [];
  store.reorder(ids);
  const result = rundown.reorderFromCards(ids, { date: req.body && req.body.date });
  log.info('rundown', result.persisted
    ? `Orden de escaleta actualizado: ${result.slotIds.join(' → ')}`
    : 'Orden de cartelas manuales actualizado');
  res.json(result);
});

app.post('/api/upload', upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'sin archivo' });
  const rel = path.join('data/uploads', req.file.filename).replace(/\\/g, '/');
  log.info('upload-foto', `Foto recibida: ${req.file.filename}`);
  res.json({ path: rel, url: `/media/uploads/${req.file.filename}` });
});

app.get('/api/video-library', (req, res) => {
  let items = [];
  try {
    const uploaded = fs.readdirSync(paths.uploads)
      .filter((f) => /\.mp4$/i.test(f))
      .map((name) => {
        const full = path.join(paths.uploads, name);
        const st = fs.statSync(full);
        const rel = path.join('data/uploads', name).replace(/\\/g, '/');
        return {
          name,
          label: videoLibraryLabel(name, st),
          path: rel,
          url: `/media/uploads/${name}`,
          size: st.size,
          mtime: st.mtime.toISOString(),
        };
      });
    const project = fs.readdirSync(ROOT)
      .filter((f) => /^[A-Za-z0-9_.-]+\.mp4$/i.test(f))
      .map((name) => {
        const full = path.join(ROOT, name);
        const st = fs.statSync(full);
        return {
          name,
          path: name,
          url: `/media/project-videos/${name}`,
          size: st.size,
          mtime: st.mtime.toISOString(),
        };
      });
    items = [...uploaded, ...project].sort((a, b) => String(b.mtime).localeCompare(String(a.mtime)));
  } catch {}
  res.json({ items });
});

// Subir una fuente propia (.ttf/.otf) -> assets/fonts como Familia-Peso.ext.
const fontUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'assets', 'fonts')),
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname).toLowerCase().replace('.', '') || 'ttf');
      const fam = String(req.query.family || 'Custom').replace(/[^A-Za-z0-9]/g, '') || 'Custom';
      const w = String(req.query.weight || '700').replace(/[^0-9]/g, '') || '700';
      cb(null, `${fam}-${w}.${ext === 'otf' ? 'otf' : 'ttf'}`);
    },
  }),
  limits: { fileSize: 6 * 1024 * 1024 },
});
app.post('/api/font', fontUpload.single('font'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'sin archivo' });
  require('./generator/htmlRender').invalidateFonts();
  log.info('font', 'Fuente subida: ' + req.file.filename);
  res.json({ ok: true, file: req.file.filename, family: req.query.family });
});

// --- Muestras de plantillas (galería) ---
// Se generan UNA vez y quedan en output/samples/. Solo caducan si cambia el
// diseño global (marca, paleta, pantalla) o la lista de plantillas.
const SAMPLE_DATA = {
  titular: { title: 'Vitoria, capital verde de Europa', subtitle: 'Ciudad', date: 'Hoy' },
  noticia: { title: 'El tranvía llega al centro', subtitle: 'Movilidad', body: 'La nueva línea conecta el centro con los barrios del sur.', date: '24 jun' },
  dato: { title: '1.240', subtitle: 'Personas en las piscinas', body: 'Actualizado cada 15 min', date: '13:00' },
  alerta: { title: 'Corte de tráfico en la Avenida', subtitle: 'Tráfico', body: 'Desvíos por la calle Dato', date: 'Hoy' },
  meteoaviso: { title: 'Alerta naranja', subtitle: 'Temperaturas extremas', body: 'Evita actividad física en las horas centrales y bebe agua con frecuencia.', date: 'Mañana · AEMET' },
  evento: { title: 'Kaldearte: Ballet Aéreo', subtitle: 'Espectáculo', body: 'Plaza de la Virgen Blanca', date: 'Sáb 28 · 21:30' },
  cita: { title: 'Volar sobre la ciudad cambia tu mirada', subtitle: 'Iñigo Naya' },
  clima: { title: '24º', subtitle: 'Soleado', body: '', date: 'AHORA', data: { max: 28, min: 14 } },
  aire: { title: 'MUY BUENA', subtitle: 'Calidad del aire', body: 'Peor indicador: PM10', date: 'Vitoria-Gasteiz · Open-Meteo' },
  foto: { title: 'Atardecer sobre la Catedral', subtitle: 'Postal', date: '22:00' },
  agenda: { title: 'Agenda', body: '19:30 | Los Chunguitos Live | Jimmy Jazz\n20:00 | La Tremenda Pasarela | Teatro Félix Petite' },
  mensaje: { title: 'Vitoria en verde.' },
  prevision: {
    title: '24º', subtitle: 'Previsión · Vitoria-Gasteiz', date: 'Open-Meteo',
    data: { days: [
      { label: 'HOY', cond: 'Soleado', max: 24, min: 14 },
      { label: 'MAÑANA', cond: 'Poco nuboso', max: 22, min: 13 },
      { label: 'PASADO', cond: 'Lluvia', max: 18, min: 12 },
    ] },
  },
  luz: {
    title: '12,4 cts', subtitle: 'Precio de la luz', date: 'kWh · PVPC · REE',
    data: {
      series: [18.2, 16.9, 15.8, 15.1, 14.7, 14.9, 16.2, 19.4, 22.1, 20.3, 17.6, 14.2, 10.8, 8.4, 6.9, 6.1, 6.6, 8.1, 12.7, 19.8, 24.6, 23.1, 20.9, 19.3].map((v, h) => ({ h, v })),
      cheap: { h: 15, v: 6.1 }, exp: { h: 20, v: 24.6 }, now: { h: 12, v: 10.8 },
    },
  },
  gasolina: {
    title: '1,479 €', subtitle: 'Gasolina 95 · la más barata', date: 'Precios oficiales · MITECO',
    data: {
      stations: [
        { name: 'Ballonti Energy', addr: 'Av. de los Huetos 46', g95: 1.479, goa: 1.389 },
        { name: 'Petronor Arriaga', addr: 'Arriagako Atea 2', g95: 1.508, goa: 1.405 },
        { name: 'Repsol Olarizu', addr: 'Ctra. de Castilla 12', g95: 1.531, goa: 1.419 },
      ],
    },
  },
};
const SAMPLES_DIR = path.join(paths.output, 'samples');
const SAMPLES_META = path.join(SAMPLES_DIR, 'meta.json');

function samplesHash(matrix = false) {
  const crypto = require('crypto');
  return crypto.createHash('sha1').update(JSON.stringify({
    v: 13, // subir al cambiar el diseño de las plantillas en código
    matrix,
    brand: cfg.brand, palette: cfg.palette, screen: cfg.screen,
    tpls: templates.list().map((t) => t.id), data: SAMPLE_DATA,
  })).digest('hex');
}

function sampleName(templateId, theme) {
  return theme ? `${templateId}__${theme}` : templateId;
}

function sampleMetaFile(matrix = false) {
  return matrix ? path.join(SAMPLES_DIR, 'meta-matrix.json') : SAMPLES_META;
}

function sampleItems(matrix = false) {
  const tpls = templates.list();
  if (!matrix) return tpls.map((t) => ({ id: t.id, label: t.label, template: t.id, theme: '' }));
  const themes = Object.keys(cfg.palette || {});
  return tpls.flatMap((t) => themes.map((theme) => ({
    id: sampleName(t.id, theme),
    label: t.label,
    template: t.id,
    theme,
  })));
}

function samplesState(matrix = false) {
  let meta = null;
  try { meta = JSON.parse(fs.readFileSync(sampleMetaFile(matrix), 'utf8')); } catch {}
  const fresh = Boolean(meta && meta.hash === samplesHash(matrix));
  const items = sampleItems(matrix).map((t) => {
    const file = path.join(SAMPLES_DIR, `${t.id}.jpg`);
    const exists = fs.existsSync(file);
    const v = exists ? Math.round(fs.statSync(file).mtimeMs) : 0;
    return { ...t, url: exists ? `/media/output/samples/${t.id}.jpg?v=${v}` : null, fresh: exists && fresh };
  });
  return { matrix, items, fresh: fresh && items.every((i) => i.url), generatedAt: meta ? meta.at : null };
}

// Estado de las muestras: la galería pinta AL INSTANTE desde disco.
app.get('/api/template-samples', (req, res) => res.json(samplesState(req.query.matrix === '1')));

// (Re)generar las muestras: única acción que renderiza, y solo bajo demanda.
app.post('/api/template-samples', async (req, res) => {
  const matrix = req.query.matrix === '1';
  try {
    renderGuard.assertCanUseChrome('render');
    fs.mkdirSync(SAMPLES_DIR, { recursive: true });
    for (const t of sampleItems(matrix)) {
      const card = store.normalize({
        id: `sample_${t.id}`,
        template: t.template,
        ...(SAMPLE_DATA[t.template] || { title: 'Ejemplo · ' + t.label }),
        ...(t.theme ? { theme: t.theme } : {}),
      });
      const { buffer } = await renderToBuffer(card);
      const small = await sharp(buffer).resize(720).jpeg({ quality: 82 }).toBuffer();
      fs.writeFileSync(path.join(SAMPLES_DIR, `${t.id}.jpg`), small);
    }
    try { await require('./generator/htmlRender').close(); } catch {}
    require('./util/atomicWrite').writeJsonAtomic(sampleMetaFile(matrix), { hash: samplesHash(matrix), at: new Date().toISOString() });
    log.info('samples', `Muestras de plantillas regeneradas (${sampleItems(matrix).length})`);
    res.json({ ok: true, ...samplesState(matrix) });
  } catch (e) {
    try { await require('./generator/htmlRender').close(); } catch {}
    log.error('samples', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Previsualización de una card generada. Si existe un render FRESCO en disco
// se sirve tal cual (cero Chromium); solo se renderiza en vivo si no hay
// archivo válido (cartela nueva o modificada).
app.get('/api/preview/:id', async (req, res) => {
  const card = store.list().find((c) => c.id === req.params.id);
  if (!card) return res.status(404).end();
  try {
    if (card.type === 'generated') {
      const fresh = renderMeta.isFresh(card);
      if (fresh && !fresh.name.endsWith('.mp4')) return res.sendFile(fresh.file);
      if (fresh && fresh.name.endsWith('.mp4')) {
        // Para vídeo, la vista rápida es su póster JPG si existe.
        const poster = path.join(paths.output, `${card.id}.jpg`);
        if (fs.existsSync(poster)) return res.sendFile(poster);
      }
      const { buffer, ext } = await renderToBuffer(card);
      res.type(ext === 'png' ? 'image/png' : 'image/jpeg').send(buffer);
    } else if (card.file) {
      // Solo archivos DENTRO del proyecto: nada de rutas absolutas arbitrarias.
      const fp = path.resolve(abs(card.file));
      if (!fp.startsWith(ROOT + path.sep)) return res.status(400).json({ error: 'ruta fuera del proyecto' });
      res.sendFile(fp);
    } else {
      res.status(404).end();
    }
  } catch (e) {
    log.error('preview', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Previsualización en vivo desde datos sin guardar (para el editor).
app.post('/api/preview', async (req, res) => {
  try {
    const card = store.normalize({ ...req.body, id: 'preview' });
    let { buffer, ext } = await renderToBuffer(card);
    // Miniatura: para la galería de plantillas pedimos un JPG pequeño (más rápido de transferir).
    const tw = Number(req.body && req.body._thumbW);
    if (tw && tw > 0) {
      buffer = await sharp(buffer).resize(Math.round(tw)).jpeg({ quality: 72 }).toBuffer();
      ext = 'jpg';
    }
    res.type(ext === 'png' ? 'image/png' : 'image/jpeg').send(buffer);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, code: e.code, busy: e.code === 'PIPELINE_BUSY', lock: e.info || null });
  }
});

// Previsualización animada desde datos sin guardar. Genera un MP4 temporal
// reutilizando output/preview.mp4 para que el editor pueda enseñarlo al momento.
app.post('/api/preview-video', async (req, res) => {
  try {
    renderGuard.assertCanUseChrome('video');
    const card = store.normalize({
      ...req.body,
      id: 'preview',
      type: 'generated',
      video: true,
      duration: Math.min(3, Math.max(2, Number(req.body && req.body.duration) || 3)),
      _previewVideo: true,
    });
    const out = await require('./generator/video').renderVideoToFile(card);
    res.json({ ok: true, url: `/media/output/${path.basename(out.file)}?v=${Date.now()}`, duration: out.durationSeconds || card.duration });
  } catch (e) {
    log.error('preview-video', e.message);
    res.status(500).json({ error: e.message });
  } finally {
    try { await require('./generator/htmlRender').close(); } catch {}
  }
});

// 🚨 ÚLTIMA HORA: de una URL (o un titular escrito) a alerta roja en primera
// posición del bucle, ya renderizada. Publicar queda en manos del humano.
app.post('/api/breaking', async (req, res) => {
  try {
    const { url, title, body } = req.body || {};
    let data = { title: String(title || '').trim(), body: String(body || '').trim(), photo: null };
    if (url) {
      const d = await require('./extract').extract(url);
      data = { title: d.title || data.title, body: d.body || '', photo: d.image || null };
    }
    if (!data.title) return res.status(400).json({ error: 'falta el titular' });
    const card = store.add({
      type: 'generated', template: 'alerta', theme: 'rojo',
      title: data.title, subtitle: 'ÚLTIMA HORA', body: data.body.slice(0, 140),
      date: 'AHORA', photo: data.photo, duration: 9, enabled: true, source: 'manual',
    });
    // A primera posición del bucle.
    const rest = store.list().filter((c) => c.id !== card.id).sort((a, b) => (a.order || 0) - (b.order || 0)).map((c) => c.id);
    store.reorder([card.id, ...rest]);
    try { await require('./pipeline/generate').renderOne(card, { force: true }); } catch (e) { log.warn('breaking', 'render: ' + e.message); }
    try { await require('./generator/htmlRender').close(); } catch {}
    log.info('breaking', `🚨 ÚLTIMA HORA en primera posición: ${data.title}`);
    res.json({ ok: true, card });
  } catch (e) {
    log.error('breaking', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/import', (req, res) => res.json(importWorker()));

// Extraer datos de una URL (WordPress API / Open Graph) para prerrellenar una cartela.
app.post('/api/extract', async (req, res) => {
  const url = req.body && req.body.url;
  if (!url) return res.status(400).json({ error: 'falta url' });
  try {
    const data = await require('./extract').extract(url);
    log.info('extract', `${data.source}: ${url}`);
    res.json(data);
  } catch (e) {
    log.warn('extract', `fallo en ${url}: ${e.message}`);
    res.status(502).json({ error: e.message });
  }
});

// --- Vista previa con memoria: si nada cambió, la simulación anterior vale ---
let _reviewCache = null;
function reviewHash() {
  const crypto = require('crypto');
  const sig = store.active().map((c) =>
    `${c.id}:${Number(c.duration) || 0}:` +
    (c.type === 'generated' ? renderMeta.renderHash(c) : `${c.file || ''}:${c.updatedAt || ''}`)
  ).join('|');
  return crypto.createHash('sha1')
    .update(sig + JSON.stringify({ n: cfg.naming, p: cfg.screenProfile, f: cfg.screen.format, b: cfg.templateBumpers || {} }))
    .digest('hex');
}

// ¿Sigue vigente la última simulación? (lectura instantánea, cero trabajo)
app.get('/api/review', (req, res) => {
  if (_reviewCache && _reviewCache.hash === reviewHash()) {
    return res.json({ fresh: true, at: _reviewCache.at, result: _reviewCache.result, cards: store.list() });
  }
  res.json({ fresh: false });
});

// (Re)generar la simulación y recordarla.
app.post('/api/review', async (req, res) => {
  const result = await publish({ dryRun: true, skipImport: true, uploadSource: 'manual-check' });
  const at = new Date().toISOString();
  if (result.ok) _reviewCache = { hash: reviewHash(), result, at };
  res.json({ fresh: Boolean(result.ok), at, result, cards: store.list() });
});

function reviewExportSource(item, cardsById) {
  const card = cardsById.get(item.id);
  if (!card) return null;
  if (card.type === 'generated') {
    const wantVideo = /\.mp4$/i.test(item.file || '') || card.video === true || ((cfg.screenProfile || {}).forceVideo === true);
    const fresh = renderMeta.isFresh({ ...card, video: wantVideo ? true : card.video }, { wantVideo });
    if (fresh && fs.existsSync(fresh.file)) return fresh.file;
    const ext = wantVideo ? 'mp4' : (cfg.screen.format || 'jpg');
    const fallback = path.join(paths.output, `${card.id}.${ext}`);
    return fs.existsSync(fallback) ? fallback : null;
  }
  if (!card.file) return null;
  const fp = path.resolve(abs(card.file));
  return fp.startsWith(ROOT + path.sep) && fs.existsSync(fp) ? fp : null;
}

function runFfmpeg(args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpeg, args, { windowsHide: true });
    let err = '';
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try { p.kill('SIGKILL'); } catch {}
      reject(new Error('La exportación del histórico tardó demasiado.'));
    }, timeoutMs);
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      reject(e);
    });
    p.on('close', (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error('ffmpeg ' + code + ': ' + err.slice(-700)));
    });
  });
}

function stampName() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

app.get('/api/review/history', (req, res) => {
  const historyDir = path.join(paths.output, 'history');
  fs.mkdirSync(historyDir, { recursive: true });
  const items = fs.readdirSync(historyDir)
    .filter((name) => /\.mp4$/i.test(name))
    .map((name) => {
      const st = fs.statSync(path.join(historyDir, name));
      return { name, url: `/media/output/history/${encodeURIComponent(name)}`, size: st.size, mtime: st.mtime.toISOString(), automatic: name.startsWith('auto-') };
    })
    .sort((a, b) => b.mtime.localeCompare(a.mtime))
    .slice(0, 60);
  res.json({ items });
});

app.post('/api/review/export', async (req, res) => {
  try {
    if (!_reviewCache || _reviewCache.hash !== reviewHash() || !_reviewCache.result || !_reviewCache.result.ok) {
      return res.status(409).json({ error: 'Primero actualiza la vista previa. Así el histórico sale de la simulación vigente, sin regenerar a ciegas.' });
    }
    const manifest = (_reviewCache.result.steps.sequence && _reviewCache.result.steps.sequence.manifest) || [];
    if (!manifest.length) return res.status(400).json({ error: 'La vista previa no tiene cartelas para exportar.' });
    const cardsById = new Map(store.list().map((c) => [c.id, c]));
    const inputs = manifest.map((item) => {
      const file = reviewExportSource(item, cardsById);
      const ext = path.extname(file || '').toLowerCase();
      return {
        item,
        file,
        image: ['.jpg', '.jpeg', '.png', '.webp'].includes(ext),
        duration: Math.max(1, Number(item.duration || 8)),
      };
    });
    const missing = inputs.filter((i) => !i.file);
    if (missing.length) return res.status(400).json({ error: `Faltan ${missing.length} archivo(s) ya preparados. Regenera la vista previa y vuelve a exportar.` });

    const historyDir = path.join(paths.output, 'history');
    fs.mkdirSync(historyDir, { recursive: true });
    const name = `historico-${stampName()}-240p.mp4`;
    const out = path.join(historyDir, name);
    const args = ['-y'];
    for (const input of inputs) {
      if (input.image) args.push('-loop', '1', '-t', String(input.duration));
      args.push('-i', input.file);
    }
    const filters = inputs.map((_, i) =>
      `[${i}:v]scale=240:136:force_original_aspect_ratio=decrease,pad=240:136:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=10,format=yuv420p[v${i}]`
    );
    filters.push(inputs.map((_, i) => `[v${i}]`).join('') + `concat=n=${inputs.length}:v=1:a=0[v]`);
    args.push('-filter_complex', filters.join(';'), '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-movflags', '+faststart', out);
    await runFfmpeg(args);
    const st = fs.statSync(out);
    log.info('review', `Histórico exportado: ${name} (${inputs.length} pieza(s))`);
    res.json({
      ok: true,
      file: name,
      url: `/media/output/history/${encodeURIComponent(name)}`,
      count: inputs.length,
      width: 240,
      durationSeconds: Math.round(inputs.reduce((sum, i) => sum + i.duration, 0) * 10) / 10,
      size: st.size,
    });
  } catch (e) {
    log.error('review', `Fallo exportando histórico: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/publish', async (req, res) => {
  const dryRun = req.body && req.body.dryRun;
  const importWorker = req.body && req.body.importWorker === true;
  try {
    const result = await publish({ dryRun, skipImport: !importWorker, uploadSource: dryRun ? 'manual-check' : 'manual' });
    res.json(result);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, code: e.code, busy: e.code === 'PIPELINE_BUSY', lock: e.info || null });
  }
});

app.post('/api/ftp-test', async (req, res) => {
  const result = await require('./pipeline/upload').testFtpConnection();
  log[result.ok ? 'info' : 'warn']('ftp-test', result.ok ? `FTP OK en ${result.host}:${result.port}` : `FTP fallo: ${result.error}`);
  res.status(result.ok ? 200 : 400).json(result);
});

// --- Piloto automático: la pantalla se alimenta sola cada día ---
const autopilot = require('./autopilot');
const workers = require('./workers');

app.get('/api/autopilot', (req, res) => {
  const st = status.read().stages || {};
  const rd = rundown.read();
  res.json({
    ...autopilot.conf(),
    last: autopilot.state(),
    sync: st['autopilot-sync'] || null,
    hourly: st['autopilot-hora'] || null,
    upload: st.upload || null,
    generate: st.generate || null,
    sequence: st.sequence || null,
    busy: pipelineLock.current(),
    preflight: autopilot.preflight(),
    workers: workers.state(),
    rundown: { activeDate: rd.activeDate, report: rd.report },
  });
});

app.put('/api/autopilot', (req, res) => {
  const c = autopilot.setConf(req.body || {});
  log.info('autopilot', `Configuración: ${c.enabled ? 'ACTIVO a las ' + c.time : 'apagado'} · modo=${c.mode} · sync=${c.liveSync ? c.syncEveryMinutes + 'min' : 'off'}`);
  const st = status.read().stages || {};
  res.json({ ...c, last: autopilot.state(), sync: st['autopilot-sync'] || null, preflight: autopilot.preflight(), workers: workers.state() });
});

// Preparar el día AHORA: workers + escaleta + render. NO publica por defecto
// (la publicación pasa por revisión humana con el botón Publicar de siempre).
app.post('/api/autopilot/run', async (req, res) => {
  try {
    const r = await autopilot.runNow({
      publish: Boolean(req.body && req.body.publish === true),
      sync: Boolean(req.body && req.body.sync === true),
    });
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/workers', (req, res) => res.json({ workers: workers.state() }));

app.post('/api/workers/refresh', async (req, res) => {
  // El botón del panel es una orden explícita: trae TODO, ignorando TTLs.
  const r = await workers.refreshAll({ force: true });
  res.json(r);
});

app.get('/api/status', (req, res) => {
  const { ftpConfig } = require('./config');
  const ftpCfg = ftpConfig();
  const mem = process.memoryUsage();
  res.json({
    status: status.read(),
    ftpConfigured: Boolean(ftpCfg.host && ftpCfg.user),
    screen: cfg.screen,
    screenProfile: cfg.screenProfile || {},
    safety: renderGuard.safetyInfo(),
    processMemory: {
      rssMb: Math.round(mem.rss / 1024 / 1024),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      externalMb: Math.round(mem.external / 1024 / 1024),
    },
    operation: pipelineLock.current(),
  });
});

app.get('/api/log', (req, res) => {
  res.json(log.tail(Number(req.query.n) || 150));
});

app.get('/api/audit', (req, res) => {
  res.json(auditLog.tail(Number(req.query.n) || 200));
});

app.get('/api/operations', (req, res) => {
  res.json(operationLog.list(Number(req.query.n) || 20));
});

app.listen(env.port, () => {
  log.info('server', `Panel en http://localhost:${env.port}`);
  if (!auth.hasAdmins()) {
    log.warn('server', 'No hay administradores. Crea uno con:  npm run admin:add -- <usuario> <contraseña>');
  }
  autopilot.start();
  workers.start();
  notify.start(); // recordatorios proactivos (agenda sin cargar, etc.)
  require('./util/janitor').start(); // limpieza diaria de renders huérfanos
  require('./util/backup').start(); // backup diario de data/ + config/ (14 días)
  require('./takeover').start(); // vuelta automática del takeover al expirar
  autopublish.startWindows(); // vigilante de franjas horarias por cartela
});
