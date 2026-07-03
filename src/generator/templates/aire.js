'use strict';
// AIRE — plantilla propia para calidad del aire. No reutiliza "dato" para no
// contaminar datos útiles/curiosos con ajustes visuales de un worker.
module.exports = {
  id: 'aire',
  label: 'Calidad del aire',
  hint: { title: 'Estado (MUY BUENA, BUENA...)', subtitle: 'Etiqueta', body: 'Índice europeo', date: 'Fuente' },
  defaultTheme: 'azul',
  logoPos: 'bl',
  build(card, ctx) {
    const { W, H, theme } = ctx;
    const pad = Math.round(W * 0.05);
    const els = [];
    const title = String(card.title || 'Calidad del aire').toUpperCase();
    const body = String(card.body || '').toUpperCase();
    const date = String(card.date || '').toUpperCase();

    els.push({
      type: 'chip', x: pad, y: Math.round(H * 0.065), size: Math.round(H * 0.04),
      bg: theme.accent, color: theme.accentText, text: (card.subtitle || 'CALIDAD DEL AIRE').toUpperCase(), letterSpacing: 2,
    });
    els.push({
      type: 'text', x: pad, y: Math.round(H * 0.2), w: W - pad * 2, h: Math.round(H * 0.34),
      text: title, font: 'display', weight: 800, color: theme.text,
      align: 'center', valign: 'center', lineHeight: 0.95,
      autofit: { min: Math.round(H * 0.11), max: Math.round(H * 0.23), lines: 2 },
    });
    if (body) {
      const bandY = Math.round(H * 0.64);
      const bandH = Math.round(H * 0.13);
      els.push({ type: 'rect', x: 0, y: bandY, w: W, h: bandH, color: theme.accent });
      els.push({
        type: 'text', x: pad, y: bandY, w: W - pad * 2, h: bandH,
        text: body, font: 'display', weight: 800, color: theme.accentText,
        align: 'center', valign: 'center', lineHeight: 1,
        autofit: { min: Math.round(H * 0.04), max: Math.round(H * 0.075), lines: 1 },
      });
    }
    if (date) {
      els.push({
        type: 'text', x: Math.round(W * 0.43), y: Math.round(H * 0.84), w: Math.round(W * 0.52), h: Math.round(H * 0.08),
        text: date, font: 'text', weight: 800, color: theme.textMuted,
        align: 'right', valign: 'center', lineHeight: 1.05,
        autofit: { min: Math.round(H * 0.025), max: Math.round(H * 0.04), lines: 2 },
      });
    }
    return { background: { type: 'solid', color: theme.bg }, elements: els };
  },
};
