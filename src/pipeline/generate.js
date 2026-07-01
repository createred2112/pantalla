'use strict';
// Etapa GENERATE: renderiza a JPG todas las cartelas de tipo "generated".
const { active } = require('../store');
const { renderToFile } = require('../generator/renderCard');
const log = require('../util/logger');
const status = require('../util/status');
const renderGuard = require('../util/renderGuard');

async function renderOne(card) {
  if (card.video && renderGuard.videoAllowed()) {
    return (await require('../generator/video').renderVideoToFile(card)).file;
  }
  if (card.video) {
    log.warn('generate', `MP4 omitido por modo seguro; se genera JPG para ${card.id}`);
    return renderToFile({ ...card, video: false });
  }
  return renderToFile(card);
}

async function generate() {
  const cards = active().filter((c) => c.type === 'generated');
  const results = [];
  log.info('generate', `Renderizando ${cards.length} cartela(s) generada(s)`);
  for (const card of cards) {
    try {
      const file = await renderOne(card);
      results.push({ id: card.id, file, ok: true });
      log.info('generate', `OK ${card.id} -> ${file}`);
    } catch (e) {
      results.push({ id: card.id, ok: false, error: e.message });
      log.error('generate', `FALLO ${card.id}: ${e.message}`);
    }
  }
  try { await require('../generator/htmlRender').close(); } catch {}
  const ok = results.every((r) => r.ok);
  status.set('generate', { ok, count: results.length, results });
  return { ok, results };
}

module.exports = { generate, renderOne };
