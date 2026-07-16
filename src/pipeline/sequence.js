'use strict';
// Etapa SEQUENCE: ordena las cartelas activas y las copia a publish/ con los
// nombres finales que exige la pantalla. Valida todo antes de tocar publish/
// y lo sustituye al final para no dejar tandas parciales.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');
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

function targetVideoSpec() {
  const W = Number(cfg.screen && cfg.screen.width) || 1920;
  const H = Number(cfg.screen && cfg.screen.height) || 1080;
  const fps = Number(cfg.video && cfg.video.fps) || 25;
  return { W, H, fps };
}

function parseFps(text) {
  const m = String(text || '').match(/,\s*([0-9]+(?:\.[0-9]+)?)\s*fps\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function videoInfo(file) {
  try {
    const r = spawnSync(ffmpeg, ['-hide_banner', '-i', file], { encoding: 'utf8', windowsHide: true });
    const text = `${r.stderr || ''}\n${r.stdout || ''}`;
    const line = (text.match(/Stream #.*Video:[^\n]+/) || [''])[0];
    const size = line.match(/,\s*(\d{2,5})x(\d{2,5})(?:\s|\[|,)/);
    const codec = (line.match(/Video:\s*([^,\s]+)/i) || [])[1] || '';
    const pixFmt = (line.match(/Video:[^,]+,\s*([^,\s]+)/i) || [])[1] || '';
    return {
      codec: codec.toLowerCase(),
      pixFmt: pixFmt.toLowerCase(),
      width: size ? Number(size[1]) : null,
      height: size ? Number(size[2]) : null,
      fps: parseFps(line),
      raw: line,
    };
  } catch {
    return null;
  }
}

function needsVideoNormalize(file) {
  const spec = targetVideoSpec();
  const info = videoInfo(file);
  if (!info || !info.width || !info.height || !info.fps) return { yes: true, info };
  const fpsDiff = Math.abs(info.fps - spec.fps);
  return {
    yes: info.codec !== 'h264' ||
      !info.pixFmt.startsWith('yuv420p') ||
      info.width !== spec.W ||
      info.height !== spec.H ||
      fpsDiff > 0.25,
    info,
  };
}

function normalizeVideoForPublish(src, dest) {
  const { W, H, fps } = targetVideoSpec();
  const r = spawnSync(ffmpeg, [
    '-y', '-i', src, '-an',
    '-vf', `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${fps},format=yuv420p`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-preset', 'veryfast', '-movflags', '+faststart',
    dest,
  ], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) {
    const err = `${r.stderr || ''}\n${r.stdout || ''}`.trim().slice(-500);
    throw new Error(`ffmpeg ${r.status}: ${err}`);
  }
}

function copyForPublish(src, dest, file) {
  if (path.extname(file).toLowerCase() !== '.mp4') {
    fs.copyFileSync(src, dest);
    return;
  }
  const check = needsVideoNormalize(src);
  if (!check.yes) {
    fs.copyFileSync(src, dest);
    return;
  }
  const info = check.info || {};
  log.warn('sequence', `Normalizando ${file} para pantalla (${info.width || '?'}x${info.height || '?'}, ${info.fps || '?'} fps, ${info.codec || '?'}/${info.pixFmt || '?'})`);
  normalizeVideoForPublish(src, dest);
}

function swapPublishDir(stagingDir) {
  const parent = path.dirname(paths.publish);
  const backupDir = path.join(parent, `.publish-backup-${Date.now()}-${process.pid}`);
  const prevDir = paths.publish + '-anterior';

  try {
    if (fs.existsSync(paths.publish)) fs.renameSync(paths.publish, backupDir);
    fs.renameSync(stagingDir, paths.publish);
    if (fs.existsSync(backupDir)) {
      // TANDA DE SEGURIDAD: la emisión anterior se conserva en
      // publish-anterior/ para poder volver atrás con un toque.
      try {
        fs.rmSync(prevDir, { recursive: true, force: true });
        fs.renameSync(backupDir, prevDir);
      } catch {
        try { fs.rmSync(backupDir, { recursive: true, force: true }); } catch {}
      }
    }
  } catch (e) {
    try {
      if (!fs.existsSync(paths.publish) && fs.existsSync(backupDir)) fs.renameSync(backupDir, paths.publish);
    } catch {}
    throw e;
  }
}

// --- Última tanda publicada (para el diff visual antes de publicar) ---
const LAST_TANDA_DIR = path.join(path.dirname(paths.data), 'last-tanda');

function lastTandaManifest() {
  try { return JSON.parse(fs.readFileSync(path.join(LAST_TANDA_DIR, 'manifest.json'), 'utf8')).items || []; } catch { return []; }
}

// Firma de contenido de una cartela para detectar "esta posición cambia".
function cardSignature(card, src) {
  if (card.type === 'generated') {
    try { return renderMeta.renderHash(card); } catch { /* sigue abajo */ }
  }
  try { const st = fs.statSync(src); return `f:${path.basename(src)}:${st.size}:${Math.round(st.mtimeMs)}`; }
  catch { return 'f:' + String(src || card.id); }
}

// Compara la secuencia nueva con la última tanda publicada, posición a posición.
function diffAgainstLastTanda(manifest) {
  const prev = lastTandaManifest();
  return manifest.map((m) => {
    const p = prev[m.order - 1] || null;
    const change = !p ? 'nueva' : (p.id !== m.id || p.hash !== m.hash ? 'cambia' : 'igual');
    return { order: m.order, file: m.file, id: m.id, change, prevId: p ? p.id : null };
  });
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
      title: card.title || '',
      hash: cardSignature(card, src),
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
    const r = { ok: true, dryRun: true, count: manifest.length, requiredCount: countNeeded || undefined, manifest, diff: diffAgainstLastTanda(manifest), files: filesForPublish(copies.map((c) => c.file)), omitted };
    status.set('sequence', r);
    log.info('sequence', `Prueba de secuencia OK: ${manifest.length} archivo(s); publish/ no se modifica`);
    return r;
  }

  const stagingDir = path.join(path.dirname(paths.publish), `.publish-staging-${Date.now()}-${process.pid}`);
  try {
    fs.mkdirSync(stagingDir, { recursive: true });
    for (const c of copies) copyForPublish(c.src, path.join(stagingDir, c.file), c.file);
    if (includePlaylist()) writePlaylist(stagingDir, manifest);
    swapPublishDir(stagingDir);
  } catch (e) {
    try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch {}
    const r = { ok: false, error: `No se pudo preparar publish/: ${e.message}`, count: manifest.length, manifest };
    status.set('sequence', r);
    log.error('sequence', r.error);
    return r;
  }

  const result = { ok: true, count: manifest.length, requiredCount: countNeeded || undefined, manifest, diff: diffAgainstLastTanda(manifest), files: filesForPublish(copies.map((c) => c.file)), omitted };
  status.set('sequence', result);
  log.info('sequence', `Secuencia lista: ${manifest.length} archivo(s) en publish/`);
  if (omitted.length) log.warn('sequence', `${omitted.length} cartela(s) activa(s) quedan fuera porque la pantalla solo admite ${countNeeded}`);
  return result;
}

// Guarda la "última tanda publicada": manifest + miniaturas por posición.
// Se llama tras una subida REAL correcta. Es la referencia del diff y del
// "antes" visual en el diálogo de publicar.
function rememberPublishedTanda(manifest) {
  try {
    fs.mkdirSync(LAST_TANDA_DIR, { recursive: true });
    for (const m of manifest || []) {
      const poster = path.join(paths.output, `${m.id}.jpg`);
      const dest = path.join(LAST_TANDA_DIR, `${path.basename(m.file, path.extname(m.file))}.jpg`);
      try {
        if (fs.existsSync(poster)) fs.copyFileSync(poster, dest);
        else fs.rmSync(dest, { force: true });
      } catch {}
    }
    fs.writeFileSync(path.join(LAST_TANDA_DIR, 'manifest.json'), JSON.stringify({ publishedAt: new Date().toISOString(), items: manifest || [] }, null, 2));
    return { ok: true };
  } catch (e) {
    log.warn('sequence', `No se pudo guardar la última tanda: ${e.message}`);
    return { ok: false, error: e.message };
  }
}

module.exports = { sequence, rememberPublishedTanda, lastTandaManifest, LAST_TANDA_DIR };
