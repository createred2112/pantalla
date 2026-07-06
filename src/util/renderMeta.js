'use strict';
// Caché de renders: recuerda con qué contenido se generó cada archivo de
// output/ (hash) para NO volver a renderizar si nada cambió. Solo se regenera
// cuando cambia el contenido de la cartela, el diseño global que le afecta,
// o cuando el usuario lo pide explícitamente (force).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { cfg, paths, abs } = require('../config');
const { writeJsonAtomic } = require('./atomicWrite');

const FILE = path.join(paths.output, '.render-meta.json');
let _cache = null;

function loadAll() {
  if (_cache) return _cache;
  try { _cache = JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { _cache = {}; }
  if (!_cache.__byHash || typeof _cache.__byHash !== 'object') _cache.__byHash = {};
  return _cache;
}

function saveAll() {
  writeJsonAtomic(FILE, loadAll());
}

// Tema resuelto de la cartela (solo ese tema invalida, no toda la paleta).
function themeFor(card) {
  let key = card.theme || '';
  try {
    if (!key) {
      const tpl = require('../generator/templates').get(card.template);
      key = (tpl && tpl.defaultTheme) || (cfg.defaults && cfg.defaults.theme) || 'carbon';
    }
  } catch { key = key || 'carbon'; }
  return { key, value: (cfg.palette || {})[key] || null };
}

// Firma de un archivo en disco (la foto puede cambiar de contenido con la misma ruta).
function fileSig(p) {
  try {
    if (!p) return null;
    const st = fs.statSync(abs(p));
    return `${p}:${st.size}:${Math.round(st.mtimeMs)}`;
  } catch { return p || null; }
}

function templateBumpersFor(card) {
  const all = cfg.templateBumpers || {};
  const keys = [
    card.bumperKey,
    card.rundownLibraryKey ? `library:${card.rundownLibraryKey}` : '',
    card.rundownWorkerKey ? `worker:${card.rundownWorkerKey}` : '',
    card.template,
  ].filter(Boolean);
  const b = keys.map((key) => all[key]).find((item) => item && (item.intro || item.outro)) || {};
  return {
    intro: b.intro || '',
    outro: b.outro || '',
  };
}

function visualData(card) {
  // La plantilla de aire no pinta los valores numéricos internos; pinta estado,
  // indicador y fuente desde title/body/date. Así puede reutilizar BUENA, etc.
  if (card.template === 'aire') return null;
  return card.data || null;
}

// Hash de TODO lo que afecta al píxel final de una cartela generada.
function renderHash(card) {
  let tplLayout = null;
  const theme = themeFor(card);
  try { tplLayout = require('../templateLayouts').get(card.template, theme.key); } catch {}
  const tplBumpers = templateBumpersFor(card);
  const src = {
    v: 25, // subir al cambiar el diseño de las plantillas en código
    template: card.template || '',
    theme,
    layout: card.layout || null,
    tplLayout,
    title: card.title || '',
    subtitle: card.subtitle || '',
    body: card.body || '',
    date: card.date || '',
    data: visualData(card),
    photo: fileSig(card.photo),
    video: card.video === true,
    motion: card.video ? 4 : null, // versión de la coreografía de animación
    videoIntro: card.video ? fileSig(card.videoIntro || tplBumpers.intro) : null,
    videoOutro: card.video ? fileSig(card.videoOutro || tplBumpers.outro) : null,
    duration: card.video ? (Number(card.duration) || 0) : null, // el MP4 depende de la duración
    brand: cfg.brand || {},
    screen: { width: cfg.screen.width, height: cfg.screen.height, format: cfg.screen.format, quality: cfg.screen.quality, background: cfg.screen.background },
  };
  return crypto.createHash('sha1').update(JSON.stringify(src)).digest('hex');
}

function get(id) {
  return loadAll()[id] || null;
}

function set(id, meta) {
  const all = loadAll();
  const saved = { ...meta, at: new Date().toISOString() };
  all[id] = saved;
  if (saved.hash && saved.file) all.__byHash[saved.hash] = { ...saved, id };
  saveAll();
}

function remove(id) {
  const all = loadAll();
  let changed = false;
  if (all[id]) { delete all[id]; changed = true; }
  for (const [hash, meta] of Object.entries(all.__byHash || {})) {
    if (meta && meta.id === id) { delete all.__byHash[hash]; changed = true; }
  }
  if (changed) saveAll();
}

// Si el render guardado sigue siendo válido, devuelve { file (abs), name, hash }.
// opts.wantVideo: exige que el archivo reutilizado sea MP4.
function isFresh(card, opts = {}) {
  const hash = renderHash(card);
  const meta = get(card.id);
  if (meta && meta.file && meta.hash === hash) {
    const file = path.join(paths.output, meta.file);
    if (fs.existsSync(file) && !(opts.wantVideo === true && !meta.file.endsWith('.mp4'))) {
      return { file, name: meta.file, hash: meta.hash, at: meta.at, durationSeconds: meta.durationSeconds || null, shared: false };
    }
  }
  const shared = loadAll().__byHash[hash];
  if (!shared || !shared.file) return null;
  const file = path.join(paths.output, shared.file);
  if (!fs.existsSync(file)) return null;
  if (opts.wantVideo === true && !shared.file.endsWith('.mp4')) return null;
  return { file, name: shared.file, hash, at: shared.at, durationSeconds: shared.durationSeconds || null, shared: true, sourceId: shared.id || null };
}

module.exports = { renderHash, get, set, remove, isFresh, FILE };
