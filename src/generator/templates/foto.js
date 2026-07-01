'use strict';
// FOTO — foto a sangre + pie breve opcional. Motor HTML.
module.exports = {
  id: 'foto',
  label: 'Foto a pantalla completa',
  hint: { title: 'Pie de foto (opcional, corto)', subtitle: 'Etiqueta (chip, opcional)', body: '—', date: 'Hora (opcional)' },
  defaultTheme: 'carbon',
  logoPos: 'bl',
  build(card, ctx) {
    const { W, H, theme, hasPhoto } = ctx;
    const pad = Math.round(W * 0.055);
    const w = W - pad * 2;
    const strip = Math.round(H * 0.16);
    const els = [];

    els.push({ type: 'rect', x: 0, y: 0, w: W, h: Math.round(H * 0.2), gradient: 'linear-gradient(180deg, rgba(0,0,0,0.45), rgba(0,0,0,0))' });
    const hasCaption = Boolean(card.title || card.subtitle);
    if (hasCaption) {
      els.push({ type: 'rect', x: 0, y: Math.round(H * 0.5), w: W, h: Math.round(H * 0.5), gradient: 'linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,0.85))' });
      const titleY = H - strip - Math.round(H * 0.02) - Math.round(H * 0.16);
      if (card.subtitle) {
        els.push({ type: 'chip', x: pad, y: titleY - Math.round(H * 0.07), size: Math.round(H * 0.036), bg: theme.accent, color: theme.accentText, text: card.subtitle, letterSpacing: 1.5 });
      }
      if (card.title) {
        els.push({ type: 'text', x: pad, y: titleY, w, h: Math.round(H * 0.16), text: (card.title || '').toUpperCase(), font: 'display', weight: 800, color: '#ffffff', align: 'left', valign: 'bottom', lineHeight: 1.0, letterSpacingEm: -0.01, autofit: { min: Math.round(H * 0.04), max: Math.round(H * 0.075), lines: 2 } });
      }
    }
    if (card.date) {
      els.push({ type: 'text', x: Math.round(W * 0.58), y: H - strip + Math.round(H * 0.025), w: Math.round(W * 0.42) - pad, h: Math.round(H * 0.08), text: card.date.toUpperCase(), font: 'text', weight: 900, color: '#ffffff', align: 'right', valign: 'center', size: Math.round(H * 0.048) });
    }
    return { background: { type: 'photo', color: theme.bg }, elements: els };
  },
};
