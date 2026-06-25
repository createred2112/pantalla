'use strict';
// Etapa SEQUENCE: ordena las cartelas activas y las copia a publish/ con el
// esquema de renombrado (NN_slug.ext) para que la pantalla las lea por orden
// alfanumérico. Limpia publish/ antes para no dejar restos de secuencias previas.
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

// Resuelve el archivo de origen de una card según su tipo.
function sourceFile(card) {
  if (card.type === 'generated') {
    const ext = (cfg.screen.format || 'jpg').toLowerCase().replace('jpeg', 'jpg');
    return path.join(paths.output, `${card.id}.${ext}`);
  }
  // image | video: archivo ya listo (del worker de codex o subido a mano)
  return card.file ? abs(card.file) : null;
}

function clearDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) {
    fs.rmSync(path.join(dir, f), { force: true });
  }
}

function sequence() {
  const cards = active();
  clearDir(paths.publish);
  const manifest = [];
  let pos = 1;

  for (const card of cards) {
    const src = sourceFile(card);
    if (!src || !fs.existsSync(src)) {
      log.warn('sequence', `Sin archivo para ${card.id} (${card.type}); se omite`);
      continue;
    }
    const ext = path.extname(src).replace('.', '').toLowerCase() || 'jpg';
    const base = slugify(card.slug || card.title || card.id);
    let name = base;
    if (cfg.naming.prefixWithOrder) {
      name = `${pad(pos)}${cfg.naming.separator || '_'}${base}`;
    }
    if (cfg.naming.lowercase) name = name.toLowerCase();
    const dest = path.join(paths.publish, `${name}.${ext}`);
    fs.copyFileSync(src, dest);
    manifest.push({
      order: pos,
      id: card.id,
      type: card.type,
      file: path.basename(dest),
      duration: card.duration,
    });
    log.info('sequence', `${pad(pos)} -> ${path.basename(dest)}`);
    pos++;
  }

  // playlist.json opcional con tiempos (por si el reproductor lo aprovecha).
  fs.writeFileSync(
    path.join(paths.publish, 'playlist.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), items: manifest }, null, 2)
  );

  status.set('sequence', { ok: true, count: manifest.length, manifest });
  log.info('sequence', `Secuencia lista: ${manifest.length} archivo(s) en publish/`);
  return { ok: true, manifest };
}

module.exports = { sequence };
