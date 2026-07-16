'use strict';
// AVISO METEOROLÓGICO v2 — etiqueta en banda a sangre, mensaje gigante,
// consejo en grande. Cero rótulos pequeños.
const K = require('./_kit');
const v1 = require('../meteoaviso');

module.exports = {
  ...v1,
  build(card, ctx) {
    const { W, H, theme } = ctx;
    const pad = K.r(W * 0.05);
    const titleTxt = String(card.title || 'AVISO METEOROLOGICO').trim();
    const subtitle = String(card.subtitle || 'METEOROLOGIA').trim();
    const body = String(card.body || '').trim();
    const date = String(card.date || '').trim();
    const els = [];
    const bg = card.color || theme.bg;
    const ink = theme.text || '#0E0E0E';

    els.push({ type: 'rect', x: 0, y: 0, w: W, h: H, color: bg });
    els.push(...K.band(ctx, { y: 0, h: H * 0.145, bg: theme.accent, color: theme.accentText, text: subtitle, align: 'left', size: 0.085 }));

    els.push(K.title(ctx, {
      x: pad, y: H * 0.185, w: W - pad * 2, h: H * (body ? 0.37 : 0.55),
      text: titleTxt, color: ink, lines: 3, min: 0.11, max: 0.2, valign: 'center', lineHeight: 0.94,
    }));

    if (body) {
      els.push({ type: 'rect', x: pad, y: K.r(H * 0.6), w: K.r(W * 0.12), h: Math.max(8, K.r(H * 0.016)), color: theme.accent, radius: 4 });
      els.push(K.support(ctx, {
        x: pad, y: H * 0.64, w: W - pad * 2, h: H * 0.19, text: body, color: ink,
        lines: 2, min: 0.055, max: 0.075,
      }));
    }
    if (date) els.push(K.foot(ctx, { text: date, color: ink }));
    return { background: { type: 'solid', color: bg }, elements: els };
  },
};
