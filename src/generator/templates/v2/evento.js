'use strict';
// EVENTO v2 — la FECHA es la estrella y ahora es imposible no verla:
// banda de acento a sangre. Nombre grande, lugar legible.
const K = require('./_kit');
const v1 = require('../evento');

module.exports = {
  ...v1,
  build(card, ctx) {
    const { W, H, theme, hasPhoto } = ctx;
    const pad = K.r(W * 0.05);
    const w = W - pad * 2;
    const text = hasPhoto ? '#ffffff' : theme.text;
    const soft = hasPhoto ? 'rgba(255,255,255,0.92)' : theme.textMuted;
    const els = [];

    if (hasPhoto) {
      // Antes un velo negro tapaba la foto entera; ahora sombra arriba (chip y
      // nombre) y abajo (fecha y lugar), con el centro de la foto visible.
      els.push({ type: 'rect', x: 0, y: 0, w: W, h: K.r(H * 0.55), gradient: 'linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 100%)' });
      els.push({ type: 'rect', x: 0, y: K.r(H * 0.45), w: W, h: K.r(H * 0.55), gradient: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.75) 100%)' });
    }
    if (card.subtitle) {
      els.push(K.chipXL(ctx, { x: pad, y: H * 0.06, bg: theme.accent, color: theme.accentText, text: card.subtitle, size: 0.058 }));
    }
    // Nombre del evento.
    els.push(K.title(ctx, {
      x: pad, y: H * 0.185, w, h: H * 0.31,
      text: card.title, color: text, lines: 2, min: 0.11, max: 0.19, lineHeight: 0.95,
    }));
    // FECHA protagonista: banda a sangre con acento.
    if (card.date) {
      els.push(...K.band(ctx, { y: H * 0.535, h: H * 0.185, bg: theme.accent, color: theme.accentText, text: card.date, align: 'left', size: 0.12 }));
    }
    if (card.body) {
      els.push(K.support(ctx, {
        x: pad, y: H * 0.755, w, h: H * 0.1, text: card.body, color: soft,
        lines: 1, min: 0.055, max: 0.075, valign: 'center',
      }));
    }
    return { background: { type: hasPhoto ? 'photo' : 'solid', color: theme.bg }, elements: els };
  },
};
