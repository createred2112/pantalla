'use strict';
// MENSAJE v2 — el lema ocupa TODO. Techo de autofit al máximo del sistema.
const K = require('./_kit');
const v1 = require('../mensaje');

module.exports = {
  ...v1,
  build(card, ctx) {
    const { W, H, theme } = ctx;
    const pad = K.r(W * 0.05);
    const els = [
      K.title(ctx, {
        x: pad, y: H * 0.06, w: W - pad * 2, h: H * 0.78,
        text: card.title, color: theme.text, lines: 3, min: 0.16, max: 0.42, valign: 'center', lineHeight: 0.9,
      }),
    ];
    if (card.subtitle) {
      els.push(...K.band(ctx, { y: H * 0.86, h: H * 0.14, bg: theme.accent, color: theme.accentText, text: card.subtitle, size: 0.075 }));
    }
    return { background: { type: 'solid', color: theme.bg }, elements: els };
  },
};
