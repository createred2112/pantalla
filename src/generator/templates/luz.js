'use strict';
// LUZ — lectura de pantalla real. La curva fina de 24 horas queda fuera:
// priorizamos tres datos grandes que se entienden a distancia.
function two(n) { return String(n).padStart(2, '0'); }
function fmt(v) { return String(v == null ? '' : v).replace('.', ','); }

function safePrice(card, d) {
  if (card.title) return String(card.title).toUpperCase();
  if (d.now && d.now.v != null) return `${fmt(d.now.v)} CTS`;
  return 'PRECIO LUZ';
}

module.exports = {
  id: 'luz',
  label: 'Luz (precio claro)',
  hint: { title: 'Precio ahora (lo rellena el worker)', subtitle: 'Etiqueta (chip)', body: 'Consejo o contexto', date: 'Fuente' },
  defaultTheme: 'azul',
  logoPos: 'bl',
  build(card, ctx) {
    const { W, H, theme } = ctx;
    const d = card.data || {};
    const cheap = d.cheap || null;
    const exp = d.exp || null;
    const pad = Math.round(W * 0.052);
    const gap = Math.round(W * 0.026);
    const els = [];

    els.push({ type: 'rect', x: 0, y: 0, w: W, h: H, color: theme.bg });
    els.push({ type: 'chip', x: pad, y: Math.round(H * 0.055), size: Math.round(H * 0.052), bg: theme.accent, color: theme.accentText, text: card.subtitle || 'PRECIO DE LA LUZ', letterSpacing: 1 });

    els.push({
      type: 'text', x: pad, y: Math.round(H * 0.13), w: Math.round(W * 0.9), h: Math.round(H * 0.34),
      text: safePrice(card, d), font: 'display', weight: 800, color: theme.text,
      align: 'left', valign: 'center', lineHeight: 0.92,
      autofit: { min: Math.round(H * 0.2), max: Math.round(H * 0.34), lines: 1 },
    });

    const boxY = Math.round(H * 0.52);
    const boxH = Math.round(H * 0.23);
    const boxW = Math.round((W - pad * 2 - gap) / 2);
    const leftX = pad;
    const rightX = pad + boxW + gap;
    els.push({ type: 'rect', x: leftX, y: boxY, w: boxW, h: boxH, color: theme.accent, radius: Math.round(H * 0.018) });
    els.push({ type: 'rect', x: rightX, y: boxY, w: boxW, h: boxH, color: theme.text, radius: Math.round(H * 0.018) });

    els.push({
      type: 'text', x: leftX + Math.round(boxW * 0.07), y: boxY + Math.round(boxH * 0.08), w: Math.round(boxW * 0.86), h: Math.round(boxH * 0.27),
      text: 'MÁS BARATA', font: 'text', weight: 900, color: theme.accentText,
      align: 'left', valign: 'center', size: Math.round(H * 0.052),
    });
    els.push({
      type: 'text', x: leftX + Math.round(boxW * 0.07), y: boxY + Math.round(boxH * 0.36), w: Math.round(boxW * 0.86), h: Math.round(boxH * 0.54),
      text: cheap ? `${two(cheap.h)}:00` : 'HOY',
      font: 'display', weight: 800, color: theme.accentText, align: 'left', valign: 'center', lineHeight: 0.95,
      autofit: { min: Math.round(H * 0.12), max: Math.round(H * 0.2), lines: 1 },
    });

    els.push({
      type: 'text', x: rightX + Math.round(boxW * 0.07), y: boxY + Math.round(boxH * 0.08), w: Math.round(boxW * 0.86), h: Math.round(boxH * 0.27),
      text: 'EVITA', font: 'text', weight: 900, color: theme.bg,
      align: 'left', valign: 'center', size: Math.round(H * 0.052),
    });
    els.push({
      type: 'text', x: rightX + Math.round(boxW * 0.07), y: boxY + Math.round(boxH * 0.36), w: Math.round(boxW * 0.86), h: Math.round(boxH * 0.54),
      text: exp ? `${two(exp.h)}:00` : 'PICO',
      font: 'display', weight: 800, color: theme.bg, align: 'left', valign: 'center', lineHeight: 0.95,
      autofit: { min: Math.round(H * 0.12), max: Math.round(H * 0.2), lines: 1 },
    });

    const note = card.body || (cheap ? `Si puedes, programa lavadora y cargas desde las ${two(cheap.h)}:00.` : 'Consulta el precio antes de encender grandes consumos.');
    els.push({
      type: 'text', x: pad, y: Math.round(H * 0.79), w: Math.round(W * 0.66), h: Math.round(H * 0.1),
      text: note, font: 'text', weight: 800, color: theme.text,
      align: 'left', valign: 'center', lineHeight: 1.04,
      autofit: { min: Math.round(H * 0.046), max: Math.round(H * 0.074), lines: 2 },
    });

    if (card.date) {
      els.push({
        type: 'text', x: Math.round(W * 0.68), y: Math.round(H * 0.82), w: Math.round(W * 0.27), h: Math.round(H * 0.07),
        text: card.date.toUpperCase(), font: 'text', weight: 800, color: theme.textMuted,
        align: 'right', valign: 'center', size: Math.round(H * 0.038), lineHeight: 1.05,
      });
    }
    return { background: { type: 'solid', color: theme.bg }, elements: els };
  },
};
