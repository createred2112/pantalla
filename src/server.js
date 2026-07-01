'use strict';
// Servidor del panel de admin (móvil) + API REST.
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { cfg, paths, env, ensureDirs } = require('./config');
const sharp = require('sharp');
const store = require('./store');
const log = require('./util/logger');
const status = require('./util/status');
const { renderToBuffer } = require('./generator/renderCard');
const { publish } = require('./pipeline/publish');
const { importWorker } = require('./pipeline/importWorker');
const auth = require('./auth');
const rundown = require('./rundown');

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
  res.json({ screen: cfg.screen, brand: cfg.brand, defaults: cfg.defaults, templates: templates.list(), palette: cfg.palette || {} });
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
  if (body.ftp) {
    const nextFtp = { ...(cfg.ftp || {}), ...body.ftp };
    if (!body.ftp.password) nextFtp.password = (cfg.ftp && cfg.ftp.password) || '';
    partial.ftp = nextFtp;
  }
  saveConfig(partial);
  log.info('settings', 'Ajustes de diseño actualizados', Object.keys(partial));
  res.json({ ok: true, brand: cfg.brand, palette: cfg.palette, screen: cfg.screen, screenProfile: cfg.screenProfile, naming: cfg.naming, ftp: { ...cfg.ftp, password: '' } });
});

app.get('/api/cards', (req, res) => res.json(store.list()));

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
  res.json({ ok: store.remove(req.params.id) });
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

// Previsualización en vivo de una card generada (no escribe en disco salvo render en memoria).
app.get('/api/preview/:id', async (req, res) => {
  const card = store.list().find((c) => c.id === req.params.id);
  if (!card) return res.status(404).end();
  try {
    if (card.type === 'generated') {
      const { buffer, ext } = await renderToBuffer(card);
      res.type(ext === 'png' ? 'image/png' : 'image/jpeg').send(buffer);
    } else if (card.file) {
      res.sendFile(path.isAbsolute(card.file) ? card.file : path.join(paths.publish, '..', card.file));
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
    const card = store.normalize({
      ...req.body,
      id: 'preview',
      type: 'generated',
      video: true,
      duration: Math.min(6, Math.max(2, Number(req.body && req.body.duration) || 4)),
    });
    const out = await require('./generator/video').renderVideoToFile(card);
    res.json({ ok: true, url: `/media/output/${path.basename(out.file)}?v=${Date.now()}`, duration: card.duration });
  } catch (e) {
    log.error('preview-video', e.message);
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

app.post('/api/publish', async (req, res) => {
  const dryRun = req.body && req.body.dryRun;
  const result = await publish({ dryRun });
  res.json(result);
});

app.post('/api/ftp-test', async (req, res) => {
  const result = await require('./pipeline/upload').testFtpConnection();
  log[result.ok ? 'info' : 'warn']('ftp-test', result.ok ? `FTP OK en ${result.host}:${result.port}` : `FTP fallo: ${result.error}`);
  res.status(result.ok ? 200 : 400).json(result);
});

app.get('/api/status', (req, res) => {
  const { ftpConfig } = require('./config');
  const ftpCfg = ftpConfig();
  res.json({
    status: status.read(),
    ftpConfigured: Boolean(ftpCfg.host && ftpCfg.user),
    screen: cfg.screen,
    screenProfile: cfg.screenProfile || {},
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
});
