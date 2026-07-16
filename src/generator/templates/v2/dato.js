'use strict';
// DATO v2 — la cifra a tamaño máximo del sistema; todo lo demás en banda.
const K = require('./_kit');
const v1 = require('../dato');

module.exports = {
  ...v1,
  build(card, ctx) {
    const { W, H, theme } = ctx;
    const pad = K.r(W * 0.05);
    const w = W - pad * 2;
    const els = [];
    const title = String(card.title || '');
    const subtitle = String(card.subtitle || '').trim();
    const isFigure = title.replace(/\s+/g, '').length <= 9;
    const body = String(card.body || '').trim();
    const hasBody = Boolean(body && body.toLowerCase() !== title.toLowerCase() && body.toLowerCase() !== subtitle.toLowerCase());
    const usefulSubtitle = Boolean(subtitle && !/^(gasteizberri|gasteizberri\.com)$/i.test(subtitle));

    // Qué mide: banda superior a sangre, no un rótulo perdido.
    if (usefulSubtitle) {
      els.push(...K.band(ctx, { y: 0, h: H * 0.14, bg: theme.accent, color: theme.accentText, text: subtitle, size: 0.08 }));
    }

    // La cifra (o frase) al MÁXIMO.
    const zoneTop = usefulSubtitle ? H * 0.17 : H * 0.08;
    const zoneH = (hasBody ? H * 0.68 : H * 0.8) - zoneTop;
    els.push(K.title(ctx, {
      x: pad, y: zoneTop, w, h: zoneH,
      text: title, color: theme.text, align: 'center',
      lines: isFigure ? 1 : 3,
      min: isFigure ? 0.3 : 0.12,
      max: isFigure ? 0.5 : 0.2,
      lineHeight: isFigure ? 0.9 : 0.94,
    }));

    if (hasBody) {
      els.push(K.support(ctx, {
        x: pad, y: H * 0.7, w, h: H * 0.13, text: body.toUpperCase(), color: theme.text,
        lines: 2, min: 0.055, max: 0.07, align: 'center', valign: 'center', weight: 900,
      }));
    }
    if (card.date) els.push(K.foot(ctx, { text: card.date, color: theme.text }));
    return { background: { type: 'solid', color: theme.bg }, elements: els };
  },
};
