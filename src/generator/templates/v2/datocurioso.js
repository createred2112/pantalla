'use strict';
// DATO CURIOSO v2 — banda superior más alta, frase en display gigante,
// detalle en grande. Misma pegada, letra mucho mayor.
const K = require('./_kit');
const v1 = require('../datocurioso');

module.exports = {
  ...v1,
  build(card, ctx) {
    const { W, H, theme } = ctx;
    const pad = K.r(W * 0.05);
    const els = [];
    const label = String(card.subtitle || 'DATO CURIOSO').trim();
    const titleTxt = String(card.title || card.body || '').trim();
    const rawBody = String(card.body || '').trim();
    const body = rawBody && rawBody !== titleTxt && rawBody.toLowerCase() !== label.toLowerCase() ? rawBody : '';
    const footer = String(card.date || '').trim();

    els.push(...K.band(ctx, { y: 0, h: H * 0.155, bg: theme.accent, color: theme.accentText, text: label, align: 'left', size: 0.09 }));

    els.push(K.title(ctx, {
      x: pad, y: H * 0.2, w: W - pad * 2, h: H * (body ? 0.44 : 0.56),
      text: titleTxt, color: theme.text, lines: 3, min: 0.1, max: 0.17, valign: 'center', lineHeight: 0.94,
    }));

    if (body) {
      els.push(K.support(ctx, {
        x: pad, y: H * 0.69, w: W - pad * 2, h: H * 0.14, text: body.toUpperCase(), color: theme.text,
        lines: 2, min: 0.055, max: 0.068, valign: 'center', weight: 800,
      }));
    }
    if (footer) els.push(K.foot(ctx, { text: footer, color: theme.text }));
    return { background: { type: 'solid', color: theme.bg }, elements: els };
  },
};
