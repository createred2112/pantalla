'use strict';
// HISTORIAL DE EMISIONES ("máquina del tiempo"): cada subida real se archiva
// (manifest + miniaturas + los MP4 en un almacén deduplicado por contenido).
// Restaurar la emisión de cualquier día = copiar del almacén a publish/ y subir.
// Disco bajo control: se conservan las últimas 15 emisiones y el almacén se
// limpia de piezas que ya no referencia ninguna.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { paths } = require('../config');
const log = require('./logger');

const DIR = path.join(path.dirname(paths.data), 'emisiones');
const STORE = path.join(DIR, 'store');
const KEEP = 15;

function hashName(m) {
  return crypto.createHash('sha1').update(String(m.hash || m.id || m.file)).digest('hex').slice(0, 20) + path.extname(m.file || '.mp4');
}

function emissionDirs() {
  try {
    return fs.readdirSync(DIR)
      .filter((d) => d !== 'store' && fs.existsSync(path.join(DIR, d, 'manifest.json')))
      .sort()
      .reverse();
  } catch { return []; }
}

// Archiva la tanda recién publicada (se llama tras una subida real correcta).
function archive(manifest) {
  try {
    if (!Array.isArray(manifest) || !manifest.length) return { ok: false, error: 'sin manifest' };
    fs.mkdirSync(STORE, { recursive: true });
    // Con segundos y sufijo anticolisión: dos subidas muy seguidas no se pisan.
    let id = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    let dir = path.join(DIR, id);
    let n = 2;
    while (fs.existsSync(dir)) dir = path.join(DIR, `${id}-${n++}`);
    id = path.basename(dir);
    fs.mkdirSync(dir, { recursive: true });
    const items = [];
    for (const m of manifest) {
      const src = path.join(paths.publish, m.file);
      if (!fs.existsSync(src)) continue;
      const stored = hashName(m);
      const dest = path.join(STORE, stored);
      if (!fs.existsSync(dest)) fs.copyFileSync(src, dest); // deduplicado por contenido
      const poster = path.join(paths.output, `${m.id}.jpg`);
      if (fs.existsSync(poster)) {
        try { fs.copyFileSync(poster, path.join(dir, `${path.basename(m.file, path.extname(m.file))}.jpg`)); } catch {}
      }
      items.push({ order: m.order, file: m.file, title: m.title || '', stored });
    }
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ id, publishedAt: new Date().toISOString(), items }, null, 2));
    prune();
    log.info('emisiones', `Emisión archivada: ${id} (${items.length} piezas)`);
    return { ok: true, id };
  } catch (e) {
    log.warn('emisiones', `No se pudo archivar la emisión: ${e.message}`);
    return { ok: false, error: e.message };
  }
}

// Conserva las últimas KEEP emisiones y limpia el almacén de piezas huérfanas.
function prune() {
  const dirs = emissionDirs();
  for (const d of dirs.slice(KEEP)) {
    try { fs.rmSync(path.join(DIR, d), { recursive: true, force: true }); } catch {}
  }
  const referenced = new Set();
  for (const d of emissionDirs()) {
    try {
      for (const it of JSON.parse(fs.readFileSync(path.join(DIR, d, 'manifest.json'), 'utf8')).items || []) referenced.add(it.stored);
    } catch {}
  }
  try {
    for (const f of fs.readdirSync(STORE)) {
      if (!referenced.has(f)) { try { fs.rmSync(path.join(STORE, f), { force: true }); } catch {} }
    }
  } catch {}
}

function list() {
  return emissionDirs().map((d) => {
    try {
      const m = JSON.parse(fs.readFileSync(path.join(DIR, d, 'manifest.json'), 'utf8'));
      return {
        id: m.id || d,
        publishedAt: m.publishedAt || null,
        items: (m.items || []).map((it) => ({
          order: it.order, file: it.file, title: it.title,
          poster: `/media/emisiones/${encodeURIComponent(d)}/${encodeURIComponent(path.basename(it.file, path.extname(it.file)))}.jpg`,
          available: fs.existsSync(path.join(STORE, it.stored)),
        })),
      };
    } catch { return null; }
  }).filter(Boolean);
}

// Restaura una emisión archivada en publish/ (la actual pasa a "anterior").
function restore(id) {
  const dir = path.join(DIR, path.basename(String(id)));
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')); }
  catch { return { ok: false, error: 'Esa emisión no existe' }; }
  const items = manifest.items || [];
  const missing = items.filter((it) => !fs.existsSync(path.join(STORE, it.stored)));
  if (!items.length || missing.length) {
    return { ok: false, error: missing.length ? `Faltan ${missing.length} pieza(s) en el almacén` : 'Emisión vacía' };
  }
  const staging = paths.publish + `-staging-restore-${Date.now()}`;
  try {
    fs.mkdirSync(staging, { recursive: true });
    for (const it of items) fs.copyFileSync(path.join(STORE, it.stored), path.join(staging, it.file));
    const prevDir = paths.publish + '-anterior';
    const tmp = paths.publish + '-tmp-restore';
    fs.rmSync(tmp, { recursive: true, force: true });
    if (fs.existsSync(paths.publish)) fs.renameSync(paths.publish, tmp);
    fs.renameSync(staging, paths.publish);
    fs.rmSync(prevDir, { recursive: true, force: true });
    if (fs.existsSync(tmp)) fs.renameSync(tmp, prevDir);
    log.info('emisiones', `Emisión ${id} restaurada en publish/ (${items.length} piezas)`);
    return { ok: true, id, count: items.length };
  } catch (e) {
    try { fs.rmSync(staging, { recursive: true, force: true }); } catch {}
    return { ok: false, error: e.message };
  }
}

module.exports = { archive, list, restore, DIR, STORE };
