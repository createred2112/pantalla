'use strict';
// EVENTO — chip + nombre + FECHA protagonista (acento) + lugar. Foto opcional. Motor HTML.
module.exports = {
  id: 'evento',
  label: 'Evento (fecha protagonista)',
  hint: { title: 'Nombre del evento', subtitle: 'Tipo: CONCIERTO, FERIA…', body: 'Lugar (1 línea)', date: 'Fecha y hora (protagonista)' },
  defaultTheme: 'lima',
  logoPos: 'tr',
  build(card, ctx) {
    const { W, H, theme, hasPhoto } = ctx;
    const pad = Math.round(W * 0.055);
    const w = W - pad * 2;
    const text = hasPhoto ? '#ffffff' : theme.text;
    const soft = hasPhoto ? 'rgba(255,255,255,0.9)' : theme.textMuted;
    const els = [];

    if (hasPhoto) {
      els.push({ type: 'rect', x: 0, y: 0, w: W, h: H, gradient: 'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.85) 100%)' });
    }
    els.push({ type: 'rect', x: pad, y: Math.round(H * 0.13), w: Math.round(W * 0.1), h: 6, color: theme.accent });
    if (card.subtitle) {
      els.push({ type: 'chip', x: pad, y: Math.round(H * 0.16), size: Math.round(H * 0.032), bg: theme.accent, color: theme.accentText, text: card.subtitle, letterSpacing: 2 });
    }
    els.push({ type: 'text', x: pad, y: Math.round(H * 0.27), w, h: Math.round(H * 0.24), text: (card.title || '').toUpperCase(), font: 'display', weight: 800, color: text, align: 'left', valign: 'top', lineHeight: 1.0, letterSpacingEm: -0.01, autofit: { min: Math.round(H * 0.05), max: Math.round(H * 0.12), lines: 3 } });
    if (card.date) {
      els.push({ type: 'text', x: pad, y: Math.round(H * 0.54), w, h: Math.round(H * 0.13), text: card.date.toUpperCase(), font: 'display', weight: 800, color: theme.accent, align: 'left', valign: 'center', lineHeight: 1.0, autofit: { min: Math.round(H * 0.045), max: Math.round(H * 0.085), lines: 2 } });
    }
    if (card.body) {
      els.push({ type: 'text', x: pad, y: Math.round(H * 0.7), w, h: Math.round(H * 0.06), text: card.body, font: 'text', weight: 500, color: soft, align: 'left', valign: 'center', size: Math.round(H * 0.045) });
    }
    return { background: { type: hasPhoto ? 'photo' : 'solid', color: theme.bg }, elements: els };
  },
};
