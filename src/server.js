'use strict';
// Servidor del panel de admin (móvil) + API REST.
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { cfg, paths, env, ensureDirs, ROOT, abs } = require('./config');
const sharp = require('sharp');
const store = require('./store');
const log = require('./util/logger');
const status = require('./util/status');
const { renderToBuffer } = require('./generator/renderCard');
const { publish } = require('./pipeline/publish');
const { importWorker } = require('./pipeline/importWorker');
const auth = require('./auth');
const rundown = require('./rundown');
const renderGuard = require('./util/renderGuard');

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
  res.json({ ok: true, user: ok });
});

app.post('/api/logout', (req, res) => {
  auth.clearSessionCookie(res);
  res.json({ ok: true });
});

// Estado de autenticación / si hay administradores creados.
const PKG = require('../package.json');
app.get('/api/whoami', (req, res) => {
  const u = auth.userOf(req);
  res.json({ authenticated: Boolean(u), user: u ? u.user : null, hasAdmins: auth.hasAdmins(), version: PKG.version });
});

// --- Muro de autenticación para todo lo demás ---
app.use((req, res, next) => {
  if (auth.userOf(req)) return next();
  // Petición de API -> 401 JSON; navegación -> redirección a /login.
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'no autenticado' });
  if (req.accepts('html')) return res.redirect('/login');
  return res.status(401).end();
});

// A partir de aquí, todo requiere sesión válida.
app.use(express.static(PUBLIC));
app.use('/media/uploads', express.static(paths.uploads));
app.use('/media/inbox', express.static(paths.workerInbox));
app.use('/media/output', express.static(paths.output));
app.use('/fonts', express.static(path.join(__dirname, '..', 'assets', 'fonts')));

// --- Subida de fotos (desde el móvil) ---
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, paths.uploads),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `up_${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// --- API ---
const templates = require('./generator/templates');
app.get('/api/config', (req, res) => {
  res.json({ screen: cfg.screen, brand: cfg.brand, defaults: cfg.defaults, templates: templates.list(), palette: cfg.palette || {}, safety: renderGuard.safetyInfo() });
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

app.get('/api/cards', (req, res) => {
  res.json(store.list().map((card) => {
    const rendered = renderedInfo(card);
    return { ...card, rendered, staleRendered: rendered ? null : renderedInfo(card, { includeStale: true }) };
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
app.put('/api/cards/:id/layout', (req, res) => {
  const c = store.update(req.params.id, { layout: req.body && req.body.layout ? req.body.layout : null });
  if (!c) return res.status(404).json({ error: 'no existe' });
  log.info('editor', `Layout guardado en ${req.params.id}`);
  res.json({ ok: true });
});

// Guardar un layout como PREDETERMINADO de una plantilla (afecta a todas sus cartelas).
app.put('/api/templates/:id/layout', (req, res) => {
  require('./templateLayouts').set(req.params.id, req.body && req.body.layout ? req.body.layout : null);
  log.info('editor', `Layout predeterminado guardado en plantilla ${req.params.id}`);
  res.json({ ok: true });
});

app.post('/api/cards', (req, res) => res.json(store.add(req.body)));

app.put('/api/cards/:id', (req, res) => {
  const c = store.update(req.params.id, req.body);
  if (!c) return res.status(404).json({ error: 'no existe' });
  res.json(c);
});

app.delete('/api/cards/:id', (req, res) => {
  const ok = store.remove(req.params.id);
  if (ok) {
    // Limpieza: renders huérfanos de la cartela borrada.
    try {
      for (const f of fs.readdirSync(paths.output)) {
        if (f.startsWith(req.params.id + '.')) fs.rmSync(path.join(paths.output, f), { force: true });
      }
      renderMeta.remove(req.params.id);
    } catch {}
  }
  res.json({ ok });
});

app.post('/api/cards/:id/render', async (req, res) => {
  const card = store.list().find((c) => c.id === req.params.id);
  if (!card) return res.status(404).json({ error: 'no existe' });
  if (card.type !== 'generated') return res.status(400).json({ error: 'solo cartelas generadas' });
  try {
    // El botón ⟳ es la orden EXPLÍCITA del usuario: regenera siempre.
    const r = await require('./pipeline/generate').renderOne(card, { force: true });
    try { await require('./generator/htmlRender').close(); } catch {}
    log.info('generate', `Render manual ${card.id} -> ${r.file}`);
    res.json({ ok: true, file: r.file, rendered: renderedInfo(card) });
  } catch (e) {
    try { await require('./generator/htmlRender').close(); } catch {}
    log.error('generate', `FALLO render manual ${card.id}: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/reorder', (req, res) => {
  res.json(store.reorder(req.body.ids || []));
});

app.post('/api/upload', upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'sin archivo' });
  const rel = path.join('data/uploads', req.file.filename).replace(/\\/g, '/');
  log.info('upload-foto', `Foto recibida: ${req.file.filename}`);
  res.json({ path: rel, url: `/media/uploads/${req.file.filename}` });
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
  evento: { title: 'Kaldearte: Ballet Aéreo', subtitle: 'Espectáculo', body: 'Plaza de la Virgen Blanca', date: 'Sáb 28 · 21:30' },
  cita: { title: 'Volar sobre la ciudad cambia tu mirada', subtitle: 'Iñigo Naya' },
  clima: { title: '24º', subtitle: 'Soleado', body: '', date: 'AHORA', data: { max: 28, min: 14 } },
  aire: { title: 'MUY BUENA', subtitle: 'Calidad del aire', body: 'Índice europeo: 19', date: 'Vitoria-Gasteiz · Open-Meteo' },
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

function samplesHash() {
  const crypto = require('crypto');
  return crypto.createHash('sha1').update(JSON.stringify({
    v: 10, // subir al cambiar el diseño de las plantillas en código
    brand: cfg.brand, palette: cfg.palette, screen: cfg.screen,
    tpls: templates.list().map((t) => t.id), data: SAMPLE_DATA,
  })).digest('hex');
}

function samplesState() {
  let meta = null;
  try { meta = JSON.parse(fs.readFileSync(SAMPLES_META, 'utf8')); } catch {}
  const fresh = Boolean(meta && meta.hash === samplesHash());
  const items = templates.list().map((t) => {
    const file = path.join(SAMPLES_DIR, `${t.id}.jpg`);
    const exists = fs.existsSync(file);
    const v = exists ? Math.round(fs.statSync(file).mtimeMs) : 0;
    return { id: t.id, label: t.label, url: exists ? `/media/output/samples/${t.id}.jpg?v=${v}` : null, fresh: exists && fresh };
  });
  return { items, fresh: fresh && items.every((i) => i.url), generatedAt: meta ? meta.at : null };
}

// Estado de las muestras: la galería pinta AL INSTANTE desde disco.
app.get('/api/template-samples', (req, res) => res.json(samplesState()));

// (Re)generar las muestras: única acción que renderiza, y solo bajo demanda.
app.post('/api/template-samples', async (req, res) => {
  try {
    renderGuard.assertCanUseChrome('render');
    fs.mkdirSync(SAMPLES_DIR, { recursive: true });
    for (const t of templates.list()) {
      const card = store.normalize({ id: `sample_${t.id}`, template: t.id, ...(SAMPLE_DATA[t.id] || { title: 'Ejemplo · ' + t.label }) });
      const { buffer } = await renderToBuffer(card);
      const small = await sharp(buffer).resize(720).jpeg({ quality: 82 }).toBuffer();
      fs.writeFileSync(path.join(SAMPLES_DIR, `${t.id}.jpg`), small);
    }
    try { await require('./generator/htmlRender').close(); } catch {}
    require('./util/atomicWrite').writeJsonAtomic(SAMPLES_META, { hash: samplesHash(), at: new Date().toISOString() });
    log.info('samples', `Muestras de plantillas regeneradas (${templates.list().length})`);
    res.json({ ok: true, ...samplesState() });
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
    res.status(500).json({ error: e.message });
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
    res.json({ ok: true, url: `/media/output/${path.basename(out.file)}?v=${Date.now()}`, duration: card.duration });
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
  const result = await publish({ dryRun: true, skipImport: true });
  const at = new Date().toISOString();
  if (result.ok) _reviewCache = { hash: reviewHash(), result, at };
  res.json({ fresh: Boolean(result.ok), at, result, cards: store.list() });
});

app.post('/api/publish', async (req, res) => {
  const dryRun = req.body && req.body.dryRun;
  const importWorker = req.body && req.body.importWorker === true;
  const result = await publish({ dryRun, skipImport: !importWorker });
  res.json(result);
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
  res.json({ ...autopilot.conf(), last: autopilot.state(), sync: st['autopilot-sync'] || null, preflight: autopilot.preflight(), workers: workers.state() });
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
  });
});

app.get('/api/log', (req, res) => {
  res.json(log.tail(Number(req.query.n) || 150));
});

app.listen(env.port, () => {
  log.info('server', `Panel en http://localhost:${env.port}`);
  if (!auth.hasAdmins()) {
    log.warn('server', 'No hay administradores. Crea uno con:  npm run admin:add -- <usuario> <contraseña>');
  }
  autopilot.start();
  workers.start();
});
