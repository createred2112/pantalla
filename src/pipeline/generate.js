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

function forceVideoOutput() {
  const profile = require('../config').cfg.screenProfile || {};
  return profile.forceVideo === true || String(profile.outputFormat || '').toLowerCase() === 'mp4';
}

function publishableCards() {
  const cards = active();
  const { cfg } = require('../config');
  const fixed = Array.isArray(cfg.naming && cfg.naming.fixedFiles) ? cfg.naming.fixedFiles.filter(Boolean) : [];
  const required = fixed.length || Number(cfg.screenProfile && cfg.screenProfile.requiredCount) || 0;
  return required > 0 ? cards.slice(0, required) : cards;
}

// Devuelve { file, reused }. force=true regenera siempre.
async function renderOne(card, opts = {}) {
  const forcedVideo = card.type === 'generated' && forceVideoOutput();
  const effectiveCard = forcedVideo ? { ...card, video: true } : card;
  const canVideo = renderGuard.videoAllowed();
  const wantVideo = effectiveCard.video === true && canVideo;

  if (opts.force !== true) {
    // En producción MP4 se exige un MP4 fresco. Fuera de ese modo, una cartela
    // animada puede caer a JPG si el modo seguro impide renderizar vídeo.
    const fresh = renderMeta.isFresh(effectiveCard, { wantVideo: forcedVideo || wantVideo }) ||
      (!forcedVideo && effectiveCard.video && !wantVideo ? renderMeta.isFresh(effectiveCard) : null);
    if (fresh) return { file: fresh.file, reused: true };
  }

  let file;
  if (wantVideo) {
    file = (await require('../generator/video').renderVideoToFile(effectiveCard)).file;
  } else if (forcedVideo) {
    renderGuard.assertCanUseChrome('video');
  } else if (effectiveCard.video) {
    log.warn('generate', `MP4 omitido por modo seguro; se genera JPG para ${effectiveCard.id}`);
    file = await renderToFile({ ...effectiveCard, video: false });
  } else {
    file = await renderToFile(effectiveCard);
  }
  renderMeta.set(effectiveCard.id, { hash: renderMeta.renderHash(effectiveCard), file: path.basename(file) });
  return { file, reused: false };
}

async function generate(opts = {}) {
  const cards = publishableCards().filter((c) => c.type === 'generated');
  const results = [];
  let reused = 0;
  status.set('generate', { ok: null, running: true, count: cards.length, done: 0, reused: 0, results: [] });
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    try {
      log.info('generate', `Preparando vídeo ${i + 1}/${cards.length}: ${card.title || card.id}`);
      status.set('generate', { ok: null, running: true, count: cards.length, done: i, current: card.id, currentTitle: card.title || card.id, reused, results });
      const r = await renderOne(card, opts);
      if (r.reused) reused++;
      results.push({ id: card.id, file: r.file, ok: true, reused: r.reused });
      log.info('generate', r.reused ? `Reutilizado ${card.id} -> ${r.file}` : `OK ${card.id} -> ${r.file}`);
      status.set('generate', { ok: null, running: true, count: cards.length, done: i + 1, current: null, reused, results });
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
