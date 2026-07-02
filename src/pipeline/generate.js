'use strict';
// Etapa GENERATE: renderiza las cartelas de tipo "generated"... solo si hace
// falta. Si el contenido no cambió desde el último render, se REUTILIZA el
// archivo de output/ sin tocar Chromium/ffmpeg (opts.force lo salta).
const path = require('path');
const { active } = require('../store');
const { renderToFile } = require('../generator/renderCard');
const log = require('../util/logger');
const status = require('../util/status');
const renderGuard = require('../util/renderGuard');
const renderMeta = require('../util/renderMeta');

// Devuelve { file, reused }. force=true regenera siempre.
async function renderOne(card, opts = {}) {
  const wantVideo = card.video === true && renderGuard.videoAllowed();

  if (opts.force !== true) {
    // Para cartelas animadas: reutiliza el MP4 fresco; si el modo seguro está
    // activo y solo hay JPG fresco, también vale (no podemos hacer MP4 igual).
    const fresh = renderMeta.isFresh(card, { wantVideo }) || (card.video && !wantVideo ? renderMeta.isFresh(card) : null);
    if (fresh) return { file: fresh.file, reused: true };
  }

  let file;
  if (wantVideo) {
    file = (await require('../generator/video').renderVideoToFile(card)).file;
  } else if (card.video) {
    log.warn('generate', `MP4 omitido por modo seguro; se genera JPG para ${card.id}`);
    file = await renderToFile({ ...card, video: false });
  } else {
    file = await renderToFile(card);
  }
  renderMeta.set(card.id, { hash: renderMeta.renderHash(card), file: path.basename(file) });
  return { file, reused: false };
}

async function generate(opts = {}) {
  const cards = active().filter((c) => c.type === 'generated');
  const results = [];
  let reused = 0;
  for (const card of cards) {
    try {
      const r = await renderOne(card, opts);
      if (r.reused) reused++;
      results.push({ id: card.id, file: r.file, ok: true, reused: r.reused });
      if (!r.reused) log.info('generate', `OK ${card.id} -> ${r.file}`);
    } catch (e) {
      results.push({ id: card.id, ok: false, error: e.message });
      log.error('generate', `FALLO ${card.id}: ${e.message}`);
    }
  }
  try { await require('../generator/htmlRender').close(); } catch {}
  const ok = results.every((r) => r.ok);
  log.info('generate', `Generación: ${results.length - reused - results.filter((r) => !r.ok).length} nueva(s), ${reused} reutilizada(s) de ${cards.length}`);
  status.set('generate', { ok, count: results.length, reused, results });
  return { ok, results, reused };
}

module.exports = { generate, renderOne };
