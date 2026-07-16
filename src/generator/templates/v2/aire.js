'use strict';
// AIRE v2 — el estado (BUENA, MALA...) al máximo tamaño y el detalle legible.
const K = require('./_kit');
const v1 = require('../aire');

module.exports = {
  ...v1,
  build(card, ctx) {
    const { W, H, theme } = ctx;
    const pad = K.r(W * 0.05);
    const els = [];
    const titleTxt = String(card.title || 'Calidad del aire').toUpperCase();
    const body = String(card.body || '').toUpperCase();
    const date = String(card.date || '').toUpperCase();
    const hasBody = Boolean(body && body !== titleTxt);

    els.push(...K.band(ctx, { y: 0, h: H * 0.14, bg: theme.accent, color: theme.accentText, text: card.subtitle || 'CALIDAD DEL AIRE', size: 0.08 }));
    els.push(K.title(ctx, {
      x: pad, y: H * (hasBody ? 0.17 : 0.2), w: W - pad * 2, h: H * (hasBody ? 0.4 : 0.5),
      text: titleTxt, color: theme.text, align: 'center', lines: 2, min: 0.16, max: 0.3, lineHeight: 0.92,
    }));
    if (hasBody) {
      const detailY = K.r(H * 0.615);
      els.push({ id: 'el_air_detail_rule', type: 'rect', x: K.r(W * 0.36), y: detailY, w: K.r(W * 0.28), h: Math.max(8, K.r(H * 0.014)), color: theme.accent, radius: 4 });
      els.push(K.support(ctx, {
        x: pad, y: detailY + H * 0.035, w: W - pad * 2, h: H * 0.12, text: body, color: theme.textMuted,
        lines: 1, min: 0.055, max: 0.075, align: 'center', valign: 'center', weight: 900,
      }));
    }
    if (date) els.push(K.foot(ctx, { text: date, color: theme.textMuted }));
    return { background: { type: 'solid', color: theme.bg }, elements: els };
  },
};
