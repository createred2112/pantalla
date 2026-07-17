'use strict';
// NOTICIA v2 — GIGANTE. Banda de sección a sangre, titular que llena el lienzo,
// entradilla en grande y hora legible. Sin detalles pequeños.
const K = require('./_kit');
const v1 = require('../noticia');

module.exports = {
  ...v1,
  label: 'Noticia (titular + entradilla)',
  build(card, ctx) {
    const { W, H, theme, hasPhoto } = ctx;
    const pad = K.r(W * 0.05);
    const els = [];

    if (hasPhoto) {
      const text = '#ffffff';
      // La FOTO manda: nada de velos a pantalla completa. Solo una sombra
      // arriba (para el chip) y otra abajo, justo donde vive el texto.
      els.push({ type: 'rect', x: 0, y: 0, w: W, h: K.r(H * 0.18), gradient: 'linear-gradient(180deg, rgba(0,0,0,0.4), rgba(0,0,0,0))' });
      els.push({ type: 'rect', x: 0, y: K.r(H * 0.5), w: W, h: K.r(H * 0.5), gradient: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.9) 100%)' });
      if (card.subtitle) {
        els.push(...K.band(ctx, { y: 0, h: H * 0.115, bg: theme.accent, color: theme.accentText, text: card.subtitle, align: 'left', size: 0.07 }));
      }
      const strip = K.r(H * 0.16);
      const bodyH = card.body ? K.r(H * 0.115) : 0;
      const bodyY = H - strip - bodyH;
      const titleH = K.r(H * 0.42);
      els.push(K.title(ctx, {
        x: pad, y: bodyY - K.r(H * 0.02) - titleH, w: W * 0.9, h: titleH,
        text: card.title, color: text, lines: 3, min: 0.13, max: 0.2, valign: 'bottom', lineHeight: 0.96,
      }));
      if (card.body) {
        els.push(K.support(ctx, { x: pad, y: bodyY, w: W * 0.9, h: bodyH, text: card.body, color: '#ffffff', lines: 2, min: 0.055, max: 0.07 }));
      }
      if (card.date) els.push(K.foot(ctx, { text: card.date, color: text }));
      return { background: { type: 'photo', color: theme.bg }, elements: els };
    }

    // Sin foto: banda de sección arriba + titular GIGANTE + entradilla grande.
    if (card.subtitle) {
      els.push(...K.band(ctx, { y: 0, h: H * 0.13, bg: theme.accent, color: theme.accentText, text: card.subtitle, align: 'left', size: 0.075 }));
    }
    const top = card.subtitle ? H * 0.17 : H * 0.08;
    const titleBottom = card.body ? H * 0.66 : H * 0.8;
    els.push(K.title(ctx, {
      x: pad, y: top, w: W * 0.9, h: titleBottom - top,
      text: card.title, color: theme.text, lines: 3, min: 0.15, max: 0.26, valign: 'center', lineHeight: 0.94,
    }));
    if (card.body) {
      els.push({ type: 'rect', x: pad, y: K.r(H * 0.7), w: K.r(W * 0.11), h: Math.max(8, K.r(H * 0.016)), color: theme.accent, radius: 4 });
      els.push(K.support(ctx, { x: pad, y: H * 0.735, w: W * 0.9, h: H * 0.125, text: card.body, color: theme.textMuted, lines: 2, min: 0.055, max: 0.075 }));
    }
    if (card.date) els.push(K.foot(ctx, { text: card.date, color: theme.text }));
    return { background: { type: 'solid', color: theme.bg }, elements: els };
  },
};
