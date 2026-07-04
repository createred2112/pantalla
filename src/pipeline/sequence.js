'use strict';
// Etapa SEQUENCE: ordena las cartelas activas y las copia a publish/ con los
// nombres finales que exige la pantalla. Valida todo antes de tocar publish/
// y lo sustituye al final para no dejar tandas parciales.
const fs = require('fs');
const path = require('path');
const { active } = require('../store');
const { cfg, paths, abs } = require('../config');
const { slugify } = require('../util/slugify');
const log = require('../util/logger');
const status = require('../util/status');
const renderMeta = require('../util/renderMeta');
const mediaDuration = require('../util/mediaDuration');

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

function fixedPublishFiles() {
  const naming = cfg.naming || {};
  const files = Array.isArray(naming.fixedFiles) ? naming.fixedFiles : [];
  return files
    .map((f) => String(f || '').trim())
    .filter(Boolean)
    .map((f) => path.basename(f).replace(/[^A-Za-z0-9_.-]+/g, ''))
    .filter(Boolean)
    .map((f) => (cfg.naming && cfg.naming.lowercase !== false ? f.toLowerCase() : f));
}

function requiredCount() {
  const fixed = fixedPublishFiles();
  if (fixed.length) return fixed.length;
  const n = Number(cfg.screenProfile && cfg.screenProfile.requiredCount);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function outputFormat() {
  const p = cfg.screenProfile || {};
  return String(p.outputFormat || cfg.screen.format || 'jpg').toLowerCase().replace('jpeg', 'jpg');
}

function wantsMp4Only() {
  const profile = cfg.screenProfile || {};
  return profile.forceVideo === true || outputFormat() === 'mp4' || profile.acceptImage === false;
}

function targetFile(card, pos, srcExt) {
  const fixed = fixedPublishFiles();
  if (fixed.length) return fixed[pos - 1];
  const ext = wantsMp4Only() ? outputFormat() : srcExt;
  return `${fileBase(card, pos)}.${ext}`;
}

// Resuelve el archivo de origen de una card según su tipo.
function sourceFile(card) {
  if (card.type === 'generated') {
    if (card.video || wantsMp4Only()) {
      const fresh = renderMeta.isFresh({ ...card, video: true }, { wantVideo: true });
      if (fresh) return fresh.file;
      return null;
    }
    const fresh = renderMeta.isFresh(card);
    if (fresh) {
      const ext = path.extname(fresh.file).replace('.', '').toLowerCase();
      if (allowedByProfile(ext)) return fresh.file;
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
  if (fixedPublishFiles().length) return false;
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
  const allCards = active();
  const countNeeded = requiredCount();
  const cards = countNeeded ? allCards.slice(0, countNeeded) : allCards;
  const omitted = countNeeded && allCards.length > countNeeded
    ? allCards.slice(countNeeded).map((c) => ({ id: c.id, title: c.title || '' }))
    : [];
  if (!allCards.length) {
    const r = { ok: false, error: 'No hay cartelas activas para publicar', count: 0, manifest: [] };
    status.set('sequence', r);
    log.warn('sequence', r.error);
    return r;
  }
  if (countNeeded && allCards.length < countNeeded) {
    const r = {
      ok: false,
      error: `La pantalla exige ${countNeeded} vídeo(s) y solo hay ${allCards.length} cartela(s) activa(s); no se toca publish/ ni FTP`,
      count: allCards.length,
      requiredCount: countNeeded,
      manifest: [],
    };
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
    const file = targetFile(card, pos, ext);
    const targetExt = path.extname(file).replace('.', '').toLowerCase();
    if (wantsMp4Only() && targetExt !== 'mp4') {
      unsupported.push({ id: card.id, type: card.type, ext: targetExt || ext, title: card.title || '' });
      continue;
    }
    if (wantsMp4Only() && ext !== 'mp4') {
      unsupported.push({ id: card.id, type: card.type, ext, title: card.title || '' });
      continue;
    }
    const dest = path.join(paths.publish, file);
    manifest.push({
      order: pos,
      id: card.id,
      type: card.type,
      file: path.basename(dest),
      duration: mediaDuration.roundedDuration(src) || card.duration,
    });
    copies.push({ src, file: path.basename(dest) });
    log.info('sequence', `${pad(pos)} -> ${path.basename(dest)}`);
    pos++;
  }

  if (unsupported.length) {
    const r = { ok: false, error: `El perfil de pantalla exige MP4 y hay ${unsupported.length} archivo(s) de otro formato`, count: manifest.length, manifest, unsupported };
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
    const r = { ok: true, dryRun: true, count: manifest.length, requiredCount: countNeeded || undefined, manifest, files: filesForPublish(copies.map((c) => c.file)), omitted };
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

  status.set('sequence', { ok: true, count: manifest.length, requiredCount: countNeeded || undefined, manifest, files: filesForPublish(copies.map((c) => c.file)), omitted });
  log.info('sequence', `Secuencia lista: ${manifest.length} archivo(s) en publish/`);
  if (omitted.length) log.warn('sequence', `${omitted.length} cartela(s) activa(s) quedan fuera porque la pantalla solo admite ${countNeeded}`);
  return { ok: true, manifest, files: filesForPublish(copies.map((c) => c.file)), omitted };
}

module.exports = { sequence };
