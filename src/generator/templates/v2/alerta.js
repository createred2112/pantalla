'use strict';
// ALERTA v2 — banda de urgencia a sangre con la etiqueta ENORME, titular
// que llena la pantalla y detalle grande. Máximo contraste, cero detallitos.
const K = require('./_kit');
const v1 = require('../alerta');

module.exports = {
  ...v1,
  build(card, ctx) {
    const { W, H, theme } = ctx;
    const pad = K.r(W * 0.05);
    const w = W - pad * 2;
    const bg = card.color || theme.bg;
    const els = [];

    // Etiqueta de urgencia: banda completa arriba (no chip).
    els.push(...K.band(ctx, {
      y: 0, h: H * 0.145, bg: theme.accent, color: theme.accentText,
      text: card.subtitle || 'ÚLTIMA HORA', align: 'left', size: 0.085,
    }));

    const strip = K.r(H * 0.15);
    const detailH = card.body ? K.r(H * 0.14) : 0;
    const zoneTop = K.r(H * 0.185);
    const titleH = (H - strip) - zoneTop - detailH - K.r(H * 0.02);
    els.push(K.title(ctx, {
      x: pad, y: zoneTop, w, h: titleH,
      text: card.title, color: theme.text, lines: 3, min: 0.14, max: 0.24,
      valign: card.body ? 'top' : 'center', lineHeight: 0.94,
    }));
    if (card.body) {
      els.push(K.support(ctx, {
        x: pad, y: zoneTop + titleH + K.r(H * 0.01), w: W * 0.88, h: detailH,
        text: card.body, color: theme.text, lines: 2, min: 0.055, max: 0.075, valign: 'center', weight: 800,
      }));
    }
    if (card.date) els.push(K.foot(ctx, { text: card.date, color: theme.text }));
    return { background: { type: 'solid', color: bg }, elements: els };
  },
};
