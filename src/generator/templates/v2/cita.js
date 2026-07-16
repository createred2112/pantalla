'use strict';
// CITA v2 — la frase en display GIGANTE (antes iba en fuente de texto),
// comilla enorme de acento y autor bien visible.
const K = require('./_kit');
const v1 = require('../cita');

module.exports = {
  ...v1,
  build(card, ctx) {
    const { W, H, theme } = ctx;
    const pad = K.r(W * 0.07);
    const w = W - pad * 2;
    const els = [];

    els.push({ type: 'text', x: pad, y: K.r(H * 0.01), w: K.r(W * 0.3), h: K.r(H * 0.28), text: '“', font: 'display', weight: 800, color: theme.accent, align: 'left', valign: 'top', size: K.r(H * 0.38) });
    els.push({
      type: 'text', x: pad, y: K.r(H * 0.2), w, h: K.r(H * 0.52),
      text: card.title || '', font: 'display', weight: 800, color: theme.text,
      align: 'left', valign: 'center', lineHeight: 1.0, letterSpacingEm: 0,
      autofit: { min: K.r(H * 0.09), max: K.r(H * 0.17), lines: 4 },
    });
    if (card.subtitle) {
      els.push({ type: 'rect', x: pad, y: K.r(H * 0.775), w: K.r(W * 0.09), h: Math.max(8, K.r(H * 0.015)), color: theme.accent, radius: 4 });
      els.push({
        type: 'text', x: pad, y: K.r(H * 0.805), w: K.r(W * 0.6), h: K.r(H * 0.09),
        text: card.subtitle, font: 'text', weight: 800, color: theme.accent,
        align: 'left', valign: 'center',
        autofit: { min: K.r(H * 0.055), max: K.r(H * 0.07), lines: 1 },
      });
    }
    if (card.date) els.push(K.foot(ctx, { text: card.date, color: theme.textMuted }));
    return { background: { type: 'solid', color: theme.bg }, elements: els };
  },
};
