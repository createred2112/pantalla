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
    els.push({ type: 'rect', x: pad, y: Math.round(H * 0.095), w: Math.round(W * 0.09), h: Math.max(6, Math.round(H * 0.011)), color: theme.accent, radius: 3 });
    if (card.subtitle) {
      els.push({ type: 'chip', x: pad, y: Math.round(H * 0.14), size: Math.round(H * 0.04), bg: theme.accent, color: theme.accentText, text: card.subtitle, letterSpacing: 2 });
    }
    // Nombre del evento: grande pero al servicio de la FECHA, que es la estrella.
    els.push({ type: 'text', x: pad, y: Math.round(H * 0.24), w, h: Math.round(H * 0.28), text: (card.title || '').toUpperCase(), font: 'display', weight: 800, color: text, align: 'left', valign: 'center', lineHeight: 0.98, letterSpacingEm: -0.01, autofit: { min: Math.round(H * 0.07), max: Math.round(H * 0.15), lines: 3 } });
    if (card.date) {
      // FECHA protagonista en acento, tamaño de titular.
      els.push({ type: 'text', x: pad, y: Math.round(H * 0.55), w, h: Math.round(H * 0.16), text: card.date.toUpperCase(), font: 'display', weight: 800, color: theme.accent, align: 'left', valign: 'center', lineHeight: 1.0, autofit: { min: Math.round(H * 0.07), max: Math.round(H * 0.12), lines: 2 } });
    }
    if (card.body) {
      els.push({ type: 'text', x: pad, y: Math.round(H * 0.745), w, h: Math.round(H * 0.07), text: card.body, font: 'text', weight: 700, color: soft, align: 'left', valign: 'center', size: Math.round(H * 0.052) });
    }
    return { background: { type: hasPhoto ? 'photo' : 'solid', color: theme.bg }, elements: els };
  },
};
