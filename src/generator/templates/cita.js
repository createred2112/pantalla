'use strict';
// CITA — comilla decorativa + frase grande + autor. Motor HTML.
module.exports = {
  id: 'cita',
  label: 'Cita / Frase (editorial)',
  hint: { title: 'La frase entrecomillada', subtitle: 'Autor / cargo', body: '—', date: 'Fecha (opcional)' },
  defaultTheme: 'carbon',
  logoPos: 'tr',
  build(card, ctx) {
    const { W, H, theme } = ctx;
    const pad = Math.round(W * 0.08);
    const w = W - pad * 2;
    const els = [];

    els.push({ type: 'text', x: pad, y: Math.round(H * 0.03), w: Math.round(W * 0.3), h: Math.round(H * 0.26), text: '“', font: 'display', weight: 800, color: theme.accent, align: 'left', valign: 'top', size: Math.round(H * 0.32) });
    els.push({ type: 'text', x: pad, y: Math.round(H * 0.24), w, h: Math.round(H * 0.5), text: card.title || '', font: 'text', weight: 700, color: theme.text, align: 'left', valign: 'center', lineHeight: 1.06, autofit: { min: Math.round(H * 0.065), max: Math.round(H * 0.13), lines: 4 } });
    if (card.subtitle) {
      els.push({ type: 'rect', x: pad, y: Math.round(H * 0.79), w: Math.round(W * 0.07), h: Math.max(6, Math.round(H * 0.009)), color: theme.accent, radius: 3 });
      els.push({ type: 'text', x: pad, y: Math.round(H * 0.815), w, h: Math.round(H * 0.08), text: card.subtitle, font: 'text', weight: 700, color: theme.accent, align: 'left', valign: 'center', size: Math.round(H * 0.048) });
    }
    if (card.date) {
      els.push({ type: 'text', x: Math.round(W * 0.62), y: Math.round(H * 0.815), w: Math.round(W * 0.3), h: Math.round(H * 0.08), text: card.date.toUpperCase(), font: 'text', weight: 800, color: theme.textMuted, align: 'right', valign: 'center', size: Math.round(H * 0.038) });
    }
    return { background: { type: 'solid', color: theme.bg }, elements: els };
  },
};
