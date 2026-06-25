'use strict';
// Etapa IMPORT: lee los JPG/MP4 que deja el otro worker (el de codex) en
// data/worker-inbox y los registra como cartelas (type image|video).
// Idempotente: no duplica un archivo ya registrado.
const fs = require('fs');
const path = require('path');
const store = require('../store');
const { paths } = require('../config');
const log = require('../util/logger');
const status = require('../util/status');

const IMG = new Set(['.jpg', '.jpeg', '.png']);
const VID = new Set(['.mp4', '.webm', '.mov']);

function importWorker() {
  fs.mkdirSync(paths.workerInbox, { recursive: true });
  const files = fs.readdirSync(paths.workerInbox)
    .filter((f) => {
      const ext = path.extname(f).toLowerCase();
      return IMG.has(ext) || VID.has(ext);
    });

  const existing = new Set(
    store.list()
      .filter((c) => c.source === 'worker' && c.file)
      .map((c) => path.basename(c.file))
  );

  const added = [];
  for (const f of files) {
    if (existing.has(f)) continue;
    const ext = path.extname(f).toLowerCase();
    const rel = path.join('data/worker-inbox', f);
    const card = store.add({
      type: VID.has(ext) ? 'video' : 'image',
      title: path.basename(f, ext),
      file: rel,
      source: 'worker',
    });
    added.push({ id: card.id, file: f });
    log.info('import', `Importado del worker: ${f} -> ${card.id}`);
  }

  status.set('import', { ok: true, scanned: files.length, added: added.length, items: added });
  return { ok: true, scanned: files.length, added };
}

module.exports = { importWorker };
