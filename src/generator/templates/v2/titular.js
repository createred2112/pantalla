'use strict';
// TITULAR v2 — la frase LLENA la pantalla. Mínimos mucho más altos que v1.
const K = require('./_kit');
const v1 = require('../titular');

module.exports = {
  ...v1,
  build(card, ctx) {
    const { W, H, theme, hasPhoto } = ctx;
    const pad = K.r(W * 0.05);
    const text = hasPhoto ? '#ffffff' : theme.text;
    const strip = K.r(H * 0.15);
    const els = [];

    if (hasPhoto) {
      els.push({ type: 'rect', x: 0, y: 0, w: W, h: H, gradient: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0.94) 100%)' });
      els.push(K.title(ctx, {
        x: pad, y: H * 0.2, w: W - pad * 2, h: H - strip - H * 0.24,
        text: card.title, color: text, lines: 3, min: 0.15, max: 0.27, valign: 'bottom', lineHeight: 0.93,
      }));
    } else {
      els.push({ type: 'rect', x: pad, y: K.r(H * 0.07), w: K.r(W * 0.12), h: Math.max(8, K.r(H * 0.018)), color: theme.accent, radius: 4 });
      els.push(K.title(ctx, {
        x: pad, y: H * 0.12, w: W - pad * 2, h: H - strip - H * 0.16,
        text: card.title, color: text, lines: 3, min: 0.16, max: 0.3, valign: 'center', lineHeight: 0.92,
      }));
    }
    if (card.date) els.push(K.foot(ctx, { text: card.date, color: text }));
    return { background: { type: hasPhoto ? 'photo' : 'solid', color: theme.bg }, elements: els };
  },
};
