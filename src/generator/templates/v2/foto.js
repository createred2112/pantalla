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

    els.push({ type: 'rect', x: 0, y: 0, w: W, h: K.r(H * 0.14), gradient: 'linear-gradient(180deg, rgba(0,0,0,0.35), rgba(0,0,0,0))' });
    const hasCaption = Boolean(card.title || card.subtitle);
    if (hasCaption) {
      // Sombra SOLO en el tercio inferior (antes cubría media foto): si no hay
      // pie escrito, apenas una franja fina para el chip.
      const scrimTop = card.title ? 0.62 : 0.8;
      els.push({ type: 'rect', x: 0, y: K.r(H * scrimTop), w: W, h: K.r(H * (1 - scrimTop)), gradient: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.72) 55%, rgba(0,0,0,0.88) 100%)' });
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
