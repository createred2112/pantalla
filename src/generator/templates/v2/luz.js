'use strict';
// LUZ v2 — precio a máximo tamaño, cajas BARATA/EVITA más altas y con
// horas gigantes. El consejo pasa a línea completa legible.
const K = require('./_kit');
const v1 = require('../luz');

function two(n) { return String(n).padStart(2, '0'); }
function fmt(v) { return String(v == null ? '' : v).replace('.', ','); }
function safePrice(card, d) {
  if (card.title) return String(card.title).toUpperCase();
  if (d.now && d.now.v != null) return `${fmt(d.now.v)} CTS`;
  return 'PRECIO LUZ';
}

module.exports = {
  ...v1,
  build(card, ctx) {
    const { W, H, theme } = ctx;
    const d = card.data || {};
    const cheap = d.cheap || null;
    const exp = d.exp || null;
    const pad = K.r(W * 0.05);
    const gap = K.r(W * 0.025);
    const els = [];

    els.push({ type: 'rect', x: 0, y: 0, w: W, h: H, color: theme.bg });
    els.push(K.chipXL(ctx, { x: pad, y: H * 0.045, bg: theme.accent, color: theme.accentText, text: card.subtitle || 'PRECIO DE LA LUZ', size: 0.058 }));

    els.push({
      type: 'text', x: pad, y: K.r(H * 0.135), w: K.r(W * 0.9), h: K.r(H * 0.32),
      text: safePrice(card, d), font: 'display', weight: 800, color: theme.text,
      align: 'left', valign: 'center', lineHeight: 0.92,
      autofit: { min: K.r(H * 0.22), max: K.r(H * 0.32), lines: 1 },
    });

    const boxY = K.r(H * 0.49);
    const boxH = K.r(H * 0.28);
    const boxW = K.r((W - pad * 2 - gap) / 2);
    const leftX = pad;
    const rightX = pad + boxW + gap;
    els.push({ type: 'rect', x: leftX, y: boxY, w: boxW, h: boxH, color: theme.accent, radius: K.r(H * 0.02) });
    els.push({ type: 'rect', x: rightX, y: boxY, w: boxW, h: boxH, color: theme.text, radius: K.r(H * 0.02) });

    const labelH = K.r(boxH * 0.3);
    els.push({
      type: 'text', x: leftX + K.r(boxW * 0.06), y: boxY + K.r(boxH * 0.06), w: K.r(boxW * 0.88), h: labelH,
      text: 'MÁS BARATA', font: 'text', weight: 900, color: theme.accentText,
      align: 'left', valign: 'center', size: K.r(H * 0.062),
    });
    els.push({
      type: 'text', x: leftX + K.r(boxW * 0.06), y: boxY + K.r(boxH * 0.36), w: K.r(boxW * 0.88), h: K.r(boxH * 0.56),
      text: cheap ? `${two(cheap.h)}:00` : 'HOY',
      font: 'display', weight: 800, color: theme.accentText, align: 'left', valign: 'center', lineHeight: 0.95,
      autofit: { min: K.r(H * 0.14), max: K.r(H * 0.22), lines: 1 },
    });

    els.push({
      type: 'text', x: rightX + K.r(boxW * 0.06), y: boxY + K.r(boxH * 0.06), w: K.r(boxW * 0.88), h: labelH,
      text: 'EVITA', font: 'text', weight: 900, color: theme.bg,
      align: 'left', valign: 'center', size: K.r(H * 0.062),
    });
    els.push({
      type: 'text', x: rightX + K.r(boxW * 0.06), y: boxY + K.r(boxH * 0.36), w: K.r(boxW * 0.88), h: K.r(boxH * 0.56),
      text: exp ? `${two(exp.h)}:00` : 'PICO',
      font: 'display', weight: 800, color: theme.bg, align: 'left', valign: 'center', lineHeight: 0.95,
      autofit: { min: K.r(H * 0.14), max: K.r(H * 0.22), lines: 1 },
    });

    // Consejo + fuente: una sola línea inferior GRANDE (en v1 medían un 2.6-3.4%).
    const note = card.body || (cheap ? `Programa lavadora y cargas desde las ${two(cheap.h)}:00` : 'Consulta el precio antes de grandes consumos');
    els.push({
      type: 'text', x: K.r(W * 0.26), y: K.r(H * 0.83), w: K.r(W * (card.date ? 0.42 : 0.69)), h: K.r(H * 0.09),
      text: String(note).toUpperCase(), font: 'text', weight: 800, color: theme.text,
      align: card.date ? 'left' : 'right', valign: 'center', lineHeight: 1.04,
      autofit: { min: K.r(H * 0.04), max: K.r(H * 0.055), lines: 1 },
    });
    if (card.date) {
      els.push({
        type: 'text', x: K.r(W * 0.7), y: K.r(H * 0.83), w: K.r(W * 0.25), h: K.r(H * 0.09),
        text: String(card.date).toUpperCase(), font: 'text', weight: 800, color: theme.textMuted,
        align: 'right', valign: 'center', lineHeight: 1.04,
        autofit: { min: K.r(H * 0.04), max: K.r(H * 0.055), lines: 1 },
      });
    }

    return { background: { type: 'solid', color: theme.bg }, elements: els };
  },
};
