'use strict';
// ALERTA / BREAKING — etiqueta arriba + titular gigante + detalle + hora. Motor HTML.
module.exports = {
  id: 'alerta',
  label: 'Alerta / Última hora',
  hint: { title: 'El titular (2-5 palabras)', subtitle: 'Etiqueta: ÚLTIMA HORA, TRÁFICO…', body: 'Detalle (1 línea, opcional)', date: 'Hora (opcional)' },
  defaultTheme: 'rojo',
  logoPos: 'bl',
  build(card, ctx) {
    const { W, H, theme } = ctx;
    const pad = Math.round(W * 0.055);
    const w = W - pad * 2;
    const bg = card.color || theme.bg;
    const strip = Math.round(H * 0.18); // reserva para logo + hora
    const tagTop = Math.round(H * 0.1);
    const tagSize = Math.round(H * 0.04);
    const els = [];

    // Banda superior de urgencia: el acento cruza toda la pantalla.
    els.push({ type: 'rect', x: 0, y: 0, w: W, h: Math.round(H * 0.028), color: theme.accent });

    els.push({ type: 'chip', x: pad, y: tagTop, size: tagSize, bg: theme.accent, color: theme.accentText, text: card.subtitle || 'ÚLTIMA HORA', radius: 0, letterSpacing: 2 });

    const zoneTop = tagTop + Math.round(tagSize * 1.9) + Math.round(H * 0.04);
    const detailH = card.body ? Math.round(H * 0.11) : 0;
    const titleH = (H - strip) - zoneTop - detailH - Math.round(H * 0.015);
    els.push({
      type: 'text', x: pad, y: zoneTop, w, h: titleH,
      text: (card.title || '').toUpperCase(), font: 'display', weight: 800, color: theme.text,
      align: 'left', valign: card.body ? 'top' : 'center', lineHeight: 0.98, letterSpacingEm: -0.02,
      autofit: { min: Math.round(H * 0.085), max: Math.round(H * 0.2), lines: 4 },
    });
    if (card.body) {
      els.push({
        type: 'text', x: pad, y: zoneTop + titleH + Math.round(H * 0.01), w: Math.round(W * 0.8), h: detailH,
        text: card.body, font: 'text', weight: 800, color: theme.text, align: 'left', valign: 'center', lineHeight: 1.12,
        autofit: { min: Math.round(H * 0.045), max: Math.round(H * 0.062), lines: 2 },
      });
    }
    if (card.date) {
      els.push({ type: 'text', x: Math.round(W * 0.58), y: H - strip + Math.round(H * 0.025), w: Math.round(W * 0.42) - pad, h: Math.round(H * 0.08), text: card.date.toUpperCase(), font: 'text', weight: 900, color: theme.text, align: 'right', valign: 'center', size: Math.round(H * 0.05), letterSpacingEm: 0.02 });
    }
    return { background: { type: 'solid', color: bg }, elements: els };
  },
};
