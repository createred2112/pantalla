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

    els.push({ type: 'text', x: pad, y: Math.round(H * 0.04), w: Math.round(W * 0.3), h: Math.round(H * 0.28), text: '“', font: 'display', weight: 800, color: theme.accent, align: 'left', valign: 'top', size: Math.round(H * 0.34) });
    els.push({ type: 'text', x: pad, y: Math.round(H * 0.3), w, h: Math.round(H * 0.42), text: card.title || '', font: 'text', weight: 700, color: theme.text, align: 'left', valign: 'center', lineHeight: 1.1, autofit: { min: Math.round(H * 0.045), max: Math.round(H * 0.1), lines: 4 } });
    if (card.subtitle) {
      els.push({ type: 'rect', x: pad, y: Math.round(H * 0.78), w: Math.round(W * 0.06), h: 6, color: theme.accent });
      els.push({ type: 'text', x: pad, y: Math.round(H * 0.8), w, h: Math.round(H * 0.07), text: card.subtitle, font: 'text', weight: 700, color: theme.accent, align: 'left', valign: 'center', size: Math.round(H * 0.04) });
    }
    return { background: { type: 'solid', color: theme.bg }, elements: els };
  },
};
