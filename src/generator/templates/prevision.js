'use strict';
// PREVISIÓN — el tiempo de HOY / MAÑANA / PASADO en tres columnas con icono,
// máxima y mínima. Requiere card.data.days (worker forecast); sin datos cae
// a la plantilla "clima" (que a su vez cae a "dato").
const { iconSvg, keyOf, iconColor, animFor } = require('./clima');

module.exports = {
  id: 'prevision',
  label: 'Previsión (3 días)',
  hint: { title: '(lo rellena el worker)', subtitle: 'Etiqueta (chip)', body: '—', date: 'Fuente' },
  defaultTheme: 'carbon',
  dynamicLayoutText: true,
  logoPos: 'bl',
  build(card, ctx) {
    const { W, H, theme } = ctx;
    const d = card.data || {};
    const days = Array.isArray(d.days) && d.days.length ? d.days.slice(0, 3) : null;
    if (!days) return require('./clima').build(card, ctx);
    const pad = Math.round(W * 0.05);
    const els = [];

    els.push({ type: 'chip', x: pad, y: Math.round(H * 0.065), size: Math.round(H * 0.042), bg: theme.accent, color: theme.accentText, text: card.subtitle || 'PREVISIÓN', letterSpacing: 2 });
    if (card.date) {
      els.push({ type: 'text', x: Math.round(W * 0.55), y: Math.round(H * 0.065), w: Math.round(W * 0.45) - pad, h: Math.round(H * 0.08), text: card.date.toUpperCase(), font: 'text', weight: 700, color: theme.textMuted, align: 'right', valign: 'center', size: Math.round(H * 0.03) });
    }

    const colW = Math.round((W - pad * 2) / days.length);
    const iconStroke = iconColor(theme);
    days.forEach((day, i) => {
      const x = pad + i * colW;
      const c = theme.text;
      if (i > 0) {
        els.push({ type: 'rect', x: x, y: Math.round(H * 0.2), w: 2, h: Math.round(H * 0.58), color: theme.textMuted, radius: 0 });
      }
      // Día
      els.push({ type: 'text', x, y: Math.round(H * 0.185), w: colW, h: Math.round(H * 0.075), text: String(day.label || '').toUpperCase(), font: 'display', weight: 800, color: c, align: 'center', valign: 'center', letterSpacingEm: 0.06, autofit: { min: Math.round(H * 0.035), max: Math.round(H * 0.055), lines: 1 } });
      // Icono
      const icoS = Math.round(H * 0.25);
      const icoKey = keyOf(day.cond);
      els.push({ type: 'svg', anim: animFor(icoKey), x: Math.round(x + (colW - icoS) / 2), y: Math.round(H * 0.285), w: icoS, h: icoS, svg: iconSvg(icoKey, iconStroke) });
      // Máxima gigante
      els.push({ type: 'text', x, y: Math.round(H * 0.55), w: colW, h: Math.round(H * 0.15), text: `${day.max}º`, font: 'display', weight: 800, color: c, align: 'center', valign: 'center', lineHeight: 1, autofit: { min: Math.round(H * 0.08), max: Math.round(H * 0.13), lines: 1 } });
      // Mínima
      els.push({ type: 'text', x, y: Math.round(H * 0.715), w: colW, h: Math.round(H * 0.06), text: `MÍN ${day.min}º`, font: 'text', weight: 700, color: theme.textMuted, align: 'center', valign: 'center', size: Math.round(H * 0.042) });
    });

    return { background: { type: 'solid', color: theme.bg }, elements: els };
  },
};
