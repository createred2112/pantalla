'use strict';
// PREVISIÓN v2 — tres columnas con día, icono y temperaturas MUCHO mayores.
// Sin datos cae a clima v2.
const K = require('./_kit');
const v1 = require('../prevision');
const clima = require('../clima');

module.exports = {
  ...v1,
  build(card, ctx) {
    const { W, H, theme } = ctx;
    const d = card.data || {};
    const days = Array.isArray(d.days) && d.days.length ? d.days.slice(0, 3) : null;
    if (!days) return require('./clima').build(card, ctx);
    const pad = K.r(W * 0.05);
    const els = [];

    els.push(K.chipXL(ctx, { x: pad, y: H * 0.045, bg: theme.accent, color: theme.accentText, text: card.subtitle || 'PREVISIÓN', size: 0.055 }));
    if (card.date) {
      els.push(K.foot(ctx, { text: card.date, color: theme.textMuted, y: H * 0.05 }));
    }

    const colW = K.r((W - pad * 2) / days.length);
    const iconStroke = clima.iconColor(theme);
    days.forEach((day, i) => {
      const x = pad + i * colW;
      if (i > 0) els.push({ type: 'rect', x, y: K.r(H * 0.2), w: 3, h: K.r(H * 0.62), color: theme.textMuted, radius: 0 });
      // Día
      els.push({ type: 'text', x, y: K.r(H * 0.185), w: colW, h: K.r(H * 0.09), text: String(day.label || '').toUpperCase(), font: 'display', weight: 800, color: theme.text, align: 'center', valign: 'center', letterSpacingEm: 0.04, autofit: { min: K.r(H * 0.05), max: K.r(H * 0.072), lines: 1 } });
      // Icono
      const icoS = K.r(H * 0.27);
      const icoKey = clima.keyOf(day.cond);
      els.push({ type: 'svg', anim: clima.animFor(icoKey), x: K.r(x + (colW - icoS) / 2), y: K.r(H * 0.29), w: icoS, h: icoS, svg: clima.iconSvg(icoKey, iconStroke) });
      // Máxima GIGANTE
      els.push({ type: 'text', x, y: K.r(H * 0.575), w: colW, h: K.r(H * 0.17), text: `${day.max}º`, font: 'display', weight: 800, color: theme.text, align: 'center', valign: 'center', lineHeight: 1, autofit: { min: K.r(H * 0.11), max: K.r(H * 0.16), lines: 1 } });
      // Mínima, también legible
      els.push({ type: 'text', x, y: K.r(H * 0.755), w: colW, h: K.r(H * 0.08), text: `MÍN ${day.min}º`, font: 'text', weight: 800, color: theme.textMuted, align: 'center', valign: 'center', size: K.r(H * 0.055) });
    });

    return { background: { type: 'solid', color: theme.bg }, elements: els };
  },
};
