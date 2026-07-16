'use strict';
// CLIMA v2 — temperatura al máximo tamaño del sistema, icono grande,
// banda de condición más alta y con letra mayor.
const K = require('./_kit');
const v1 = require('../clima');

module.exports = {
  ...v1,
  build(card, ctx) {
    const { W, H, theme } = ctx;
    const pad = K.r(W * 0.05);
    const els = [];

    if (card.date) {
      els.push(K.chipXL(ctx, { x: pad, y: H * 0.05, bg: theme.accent, color: theme.accentText, text: card.date, size: 0.055 }));
    }

    // Temperatura GIGANTE + icono al mismo peso.
    const zoneY = K.r(H * 0.16);
    const zoneH = K.r(H * 0.46);
    els.push({
      type: 'text', x: pad, y: zoneY, w: K.r(W * 0.5), h: zoneH,
      text: (card.title || '').toUpperCase(), font: 'display', weight: 800, color: theme.text,
      align: 'left', valign: 'center', lineHeight: 1, letterSpacingEm: -0.02,
      autofit: { min: K.r(H * 0.28), max: K.r(H * 0.46), lines: 1 },
    });
    const icoKey = v1.keyForCard(card);
    const conf = (ctx.brand && ctx.brand.climaIcon) || {};
    const scale = Math.max(40, Math.min(140, Number(conf.scale) || 100)) / 100;
    const icoS = K.r(Math.min(zoneH, K.r(W * 0.32)) * scale);
    const icoX = K.r(W - pad - icoS - W * 0.03 + W * ((Number(conf.dx) || 0) / 100));
    const icoY = K.r(zoneY + (zoneH - icoS) / 2 + H * ((Number(conf.dy) || 0) / 100));
    els.push({ type: 'svg', anim: v1.animFor(icoKey), x: icoX, y: icoY, w: icoS, h: icoS, svg: v1.iconSvg(icoKey, v1.iconColor(theme)) });

    // Banda de condición: más alta y con letra mayor que en v1.
    const dayRange = card.body || (card.data && card.data.max != null && card.data.min != null ? `Máx ${card.data.max}º · mín ${card.data.min}º` : '');
    const bandTxt = [card.subtitle || '', dayRange].filter(Boolean).join(' · ');
    if (bandTxt) {
      els.push(...K.band(ctx, { y: H * 0.66, h: H * 0.19, bg: theme.accent, color: theme.accentText, text: bandTxt, size: 0.105 }));
    }
    return { background: { type: 'solid', color: theme.bg }, elements: els };
  },
};
