'use strict';
// Etapa SEQUENCE: ordena las cartelas activas y las copia a publish/ con el
// esquema de renombrado (NN_slug.ext) para que la pantalla las lea por orden
// alfanumérico. Valida todo antes de tocar publish/ y lo sustituye al final.
const fs = require('fs');
const path = require('path');
const { active } = require('../store');
const { cfg, paths, abs } = require('../config');
const { slugify } = require('../util/slugify');
const log = require('../util/logger');
const status = require('../util/status');

function pad(n) {
  return String(n).padStart(cfg.naming.padStart || 2, '0');
}

function safeName(text, fallback = 'cartela') {
  const s = String(text || '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || fallback;
}

function fileBase(card, pos) {
  const naming = cfg.naming || {};
  const base = slugify(card.slug || card.title || card.id);
  const pattern = String(naming.pattern || '').trim();
  if (pattern) {
    const replacements = {
      n: String(pos),
      nn: String(pos).padStart(2, '0'),
      nnn: String(pos).padStart(3, '0'),
      order: pad(pos),
      slug: base,
      title: base,
      id: slugify(card.id),
    };
    let name = pattern.replace(/\{(n|nn|nnn|order|slug|title|id)\}/g, (_, k) => replacements[k]);
    if (naming.lowercase !== false) name = name.toLowerCase();
    return safeName(name, base || card.id);
  }

  let name = base;
  if (naming.prefixWithOrder) name = `${pad(pos)}${naming.separator || '_'}${base}`;
  if (naming.lowercase) name = name.toLowerCase();
  return safeName(name, base || card.id);
}

// Resuelve el archivo de origen de una card según su tipo.
function sourceFile(card) {
  if (card.type === 'generated') {
    if (card.video) {
      const mp4 = path.join(paths.output, `${card.id}.mp4`);
      if (fs.existsSync(mp4)) return mp4;
    }
    const ext = (cfg.screen.format || 'jpg').toLowerCase().replace('jpeg', 'jpg');
    return path.join(paths.output, `${card.id}.${ext}`);
  }
  // image | video: archivo ya listo (del worker de codex o subido a mano)
  return card.file ? abs(card.file) : null;
}

function writePlaylist(dir, manifest) {
  fs.writeFileSync(
    path.join(dir, 'playlist.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), items: manifest }, null, 2)
  );
}

function includePlaylist() {
  return !(cfg.screenProfile && cfg.screenProfile.includePlaylist === false);
}

function filesForPublish(files) {
  return includePlaylist() ? [...files, 'playlist.json'] : files;
}

function allowedByProfile(ext) {
  const profile = cfg.screenProfile || {};
  const isVideo = ext === 'mp4';
  const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(ext);
  if (isVideo && profile.acceptVideo === false) return false;
  if (isImage && profile.acceptImage === false) return false;
  return true;
}

function swapPublishDir(stagingDir) {
  const parent = path.dirname(paths.publish);
  const backupDir = path.join(parent, `.publish-backup-${Date.now()}-${process.pid}`);

  try {
    if (fs.existsSync(paths.publish)) fs.renameSync(paths.publish, backupDir);
    fs.renameSync(stagingDir, paths.publish);
    if (fs.existsSync(backupDir)) fs.rmSync(backupDir, { recursive: true, force: true });
  } catch (e) {
    try {
      if (!fs.existsSync(paths.publish) && fs.existsSync(backupDir)) fs.renameSync(backupDir, paths.publish);
    } catch {}
    throw e;
  }
}

function sequence({ dryRun } = {}) {
  const cards = active();
  if (!cards.length) {
    const r = { ok: false, error: 'No hay cartelas activas para publicar', count: 0, manifest: [] };
    status.set('sequence', r);
    log.warn('sequence', r.error);
    return r;
  }

  const manifest = [];
  const copies = [];
  const missing = [];
  const unsupported = [];
  let pos = 1;

  for (const card of cards) {
    const src = sourceFile(card);
    if (!src || !fs.existsSync(src)) {
      missing.push({ id: card.id, type: card.type, file: src || null, title: card.title || '' });
      continue;
    }
    const ext = path.extname(src).replace('.', '').toLowerCase() || 'jpg';
    if (!allowedByProfile(ext)) {
      unsupported.push({ id: card.id, type: card.type, ext, title: card.title || '' });
      continue;
    }
    const name = fileBase(card, pos);
    const dest = path.join(paths.publish, `${name}.${ext}`);
    manifest.push({
      order: pos,
      id: card.id,
      type: card.type,
      file: path.basename(dest),
      duration: card.duration,
    });
    copies.push({ src, file: path.basename(dest) });
    log.info('sequence', `${pad(pos)} -> ${path.basename(dest)}`);
    pos++;
  }

  if (unsupported.length) {
    const r = { ok: false, error: `El perfil de pantalla no acepta ${unsupported.length} archivo(s) de ese formato`, count: manifest.length, manifest, unsupported };
    status.set('sequence', r);
    for (const u of unsupported) log.warn('sequence', `Formato no permitido para ${u.id}: .${u.ext}`);
    return r;
  }

  if (missing.length) {
    const r = { ok: false, error: `Faltan archivos para ${missing.length} cartela(s); no se toca publish/`, count: manifest.length, manifest, missing };
    status.set('sequence', r);
    for (const m of missing) log.warn('sequence', `Sin archivo para ${m.id} (${m.type}); ${m.file || 'sin ruta'}`);
    return r;
  }

  if (!manifest.length) {
    const r = { ok: false, error: 'La secuencia quedó vacía; no se toca publish/', count: 0, manifest: [] };
    status.set('sequence', r);
    log.warn('sequence', r.error);
    return r;
  }

  if (dryRun) {
    const r = { ok: true, dryRun: true, count: manifest.length, manifest, files: filesForPublish(copies.map((c) => c.file)) };
    status.set('sequence', r);
    log.info('sequence', `Prueba de secuencia OK: ${manifest.length} archivo(s); publish/ no se modifica`);
    return r;
  }

  const stagingDir = path.join(path.dirname(paths.publish), `.publish-staging-${Date.now()}-${process.pid}`);
  try {
    fs.mkdirSync(stagingDir, { recursive: true });
    for (const c of copies) fs.copyFileSync(c.src, path.join(stagingDir, c.file));
    if (includePlaylist()) writePlaylist(stagingDir, manifest);
    swapPublishDir(stagingDir);
  } catch (e) {
    try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch {}
    const r = { ok: false, error: `No se pudo preparar publish/: ${e.message}`, count: manifest.length, manifest };
    status.set('sequence', r);
    log.error('sequence', r.error);
    return r;
  }

  status.set('sequence', { ok: true, count: manifest.length, manifest, files: filesForPublish(copies.map((c) => c.file)) });
  log.info('sequence', `Secuencia lista: ${manifest.length} archivo(s) en publish/`);
  return { ok: true, manifest, files: filesForPublish(copies.map((c) => c.file)) };
}

module.exports = { sequence };
