'use strict';
// TITULAR / FOTO + TITULAR (#02) — foto a sangre (o color plano) + titular ENORME.
// MIGRADA al motor HTML.
module.exports = {
  id: 'titular',
  label: 'Titular (foto + frase grande)',
  hint: { title: 'La frase (2-5 palabras)', subtitle: '—', body: '—', date: 'Hora (opcional)' },
  defaultTheme: 'carbon',
  logoPos: 'bl',
  build(card, ctx) {
    const { W, H, theme, hasPhoto } = ctx;
    const pad = Math.round(W * 0.05);
    const bottomStrip = Math.round(H * 0.16);
    const text = hasPhoto ? '#ffffff' : theme.text;
    const els = [];

    if (hasPhoto) {
      els.push({ type: 'rect', x: 0, y: 0, w: W, h: Math.round(H * 0.28), gradient: 'linear-gradient(180deg, rgba(0,0,0,0.5), rgba(0,0,0,0))' });
      els.push({ type: 'rect', x: 0, y: Math.round(H * 0.4), w: W, h: Math.round(H * 0.6), gradient: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.45) 45%, rgba(0,0,0,0.92) 100%)' });
    }

    // Titular: llena la zona inferior (sobre la franja del logo), anclado abajo.
    els.push({
      type: 'text',
      x: pad, y: Math.round(H * 0.28),
      w: W - pad * 2, h: H - bottomStrip - Math.round(H * 0.3),
      text: (card.title || '').toUpperCase(),
      font: 'display', weight: 800, color: text,
      align: 'left', valign: 'bottom',
      lineHeight: 0.95, letterSpacingEm: -0.02,
      autofit: { min: Math.round(H * 0.07), max: Math.round(H * 0.2), lines: 4 },
    });

    if (card.date) {
      els.push({
        type: 'text', x: Math.round(W * 0.58), y: H - bottomStrip + Math.round(H * 0.015), w: Math.round(W * 0.42) - pad, h: Math.round(H * 0.08),
        text: card.date.toUpperCase(), font: 'text', weight: 900, color: text, align: 'right', valign: 'center', size: Math.round(H * 0.048),
      });
    }

    return { background: { type: hasPhoto ? 'photo' : 'solid', color: theme.bg }, elements: els };
  },
};
