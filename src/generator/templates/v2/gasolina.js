'use strict';
// GASOLINA v2 — dos estaciones, precio aún más protagonista, dirección legible.
// Sin datos cae a dato v2.
const K = require('./_kit');
const v1 = require('../gasolina');

module.exports = {
  ...v1,
  build(card, ctx) {
    const { W, H, theme } = ctx;
    const d = card.data || {};
    const stations = Array.isArray(d.stations) && d.stations.length ? d.stations.slice(0, 2) : null;
    if (!stations) return require('./dato').build(card, ctx);
    const pad = K.r(W * 0.05);
    const els = [];
    const f = (v) => (typeof v === 'number' ? v.toFixed(3).replace('.', ',') : String(v || ''));
    const shortAddr = (v) => String(v || '')
      .replace(/\s+/g, ' ')
      .replace(/\b(POLIGONO|POLÍGONO|AVENIDA|CALLE|CARRETERA)\b/gi, (m) => ({ POLIGONO: 'POL.', 'POLÍGONO': 'POL.', AVENIDA: 'AV.', CALLE: 'C/', CARRETERA: 'CTRA.' }[m.toUpperCase()] || m))
      .slice(0, 40);

    els.push(K.chipXL(ctx, { x: pad, y: H * 0.045, bg: theme.accent, color: theme.accentText, text: card.subtitle || 'GASOLINA 95 · HOY', size: 0.055 }));
    // Fuente/fecha ABAJO a la derecha (arriba se pisaba con el chip cuando el
    // worker manda textos largos tipo "MITECO ..."), y con autofit: si es muy
    // larga, encoge en vez de montarse encima de nada.
    if (card.date) {
      els.push({
        type: 'text', x: K.r(W * 0.4), y: K.r(H * 0.885), w: K.r(W * 0.6) - pad, h: K.r(H * 0.075),
        text: String(card.date).toUpperCase(), font: 'text', weight: 800, color: theme.textMuted,
        align: 'right', valign: 'center', lineHeight: 1,
        autofit: { min: K.r(H * 0.028), max: K.r(H * 0.055), lines: 1 },
      });
    }

    const top = K.r(H * 0.185);
    const bottom = K.r(H * 0.86);
    const rowH = (bottom - top) / 2;
    const priceW = K.r(W * 0.38);
    const nameX = pad + priceW + K.r(W * 0.035);
    const nameW = W - nameX - pad;
    stations.forEach((s, i) => {
      const y = K.r(top + i * rowH);
      const first = i === 0;
      const color = first ? theme.accent : theme.text;
      if (i > 0) els.push({ type: 'rect', x: pad, y, w: W - pad * 2, h: 3, color: theme.textMuted, radius: 0 });
      els.push({
        type: 'text', x: pad, y: y + K.r(rowH * 0.06), w: priceW, h: K.r(rowH * 0.88),
        text: `${f(s.g95)}€`, font: 'display', weight: 800, color,
        align: 'left', valign: 'center', lineHeight: 1,
        autofit: { min: K.r(H * 0.15), max: K.r(rowH * 0.74), lines: 1 },
      });
      els.push({
        type: 'text', x: nameX, y: y + K.r(rowH * 0.12), w: nameW, h: K.r(rowH * 0.42),
        text: String(s.name || '').toUpperCase(), font: 'display', weight: 800, color,
        align: 'left', valign: 'bottom', lineHeight: 1,
        autofit: { min: K.r(H * 0.06), max: K.r(rowH * 0.34), lines: 1 },
      });
      els.push({
        type: 'text', x: nameX, y: y + K.r(rowH * 0.58), w: nameW, h: K.r(rowH * 0.32),
        text: shortAddr(s.addr).toUpperCase(),
        font: 'text', weight: 800, color: theme.textMuted, align: 'left', valign: 'top', lineHeight: 1.05,
        autofit: { min: K.r(H * 0.048), max: K.r(rowH * 0.22), lines: 1 },
      });
    });

    return { background: { type: 'solid', color: theme.bg }, elements: els };
  },
};
