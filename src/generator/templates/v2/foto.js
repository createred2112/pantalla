'use strict';
// FOTO v2 — foto a sangre y pie GRANDE. La etiqueta pasa a chip XL.
const K = require('./_kit');
const v1 = require('../foto');

module.exports = {
  ...v1,
  build(card, ctx) {
    const { W, H, theme } = ctx;
    const pad = K.r(W * 0.05);
    const w = W - pad * 2;
    const strip = K.r(H * 0.15);
    const els = [];

    els.push({ type: 'rect', x: 0, y: 0, w: W, h: K.r(H * 0.2), gradient: 'linear-gradient(180deg, rgba(0,0,0,0.45), rgba(0,0,0,0))' });
    const hasCaption = Boolean(card.title || card.subtitle);
    if (hasCaption) {
      els.push({ type: 'rect', x: 0, y: K.r(H * 0.42), w: W, h: K.r(H * 0.58), gradient: 'linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,0.9))' });
      const titleH = K.r(H * 0.26);
      const titleY = H - strip - K.r(H * 0.02) - titleH;
      if (card.subtitle) {
        els.push(K.chipXL(ctx, { x: pad, y: titleY - H * 0.1, bg: theme.accent, color: theme.accentText, text: card.subtitle, size: 0.055 }));
      }
      if (card.title) {
        els.push(K.title(ctx, {
          x: pad, y: titleY, w, h: titleH,
          text: card.title, color: '#ffffff', lines: 2, min: 0.08, max: 0.13, valign: 'bottom', lineHeight: 0.98,
        }));
      }
    }
    if (card.date) els.push(K.foot(ctx, { text: card.date, color: '#ffffff' }));
    return { background: { type: 'photo', color: theme.bg }, elements: els };
  },
};
