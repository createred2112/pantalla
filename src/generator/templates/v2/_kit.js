'use strict';
// KIT v2 — utilidades del rediseño "GIGANTE" (diseño alternativo conmutable).
//
// Filosofía v2: la pantalla tiene MUY poca resolución efectiva, así que
// desaparece todo detalle pequeño. Reglas duras:
//   - NINGÚN texto por debajo de MIN_TEXT (≈5.5% del alto ≈ 59px a 1080p).
//   - Chips pequeños → BANDAS a sangre con texto enorme.
//   - Máximo 3 zonas por cartela: etiqueta, protagonista, apoyo.
//   - Colores planos de la paleta de siempre (chillones, sin degradados nuevos).

// Tamaños relativos al ALTO de pantalla (se escalan a cualquier resolución).
const S = {
  MIN_TEXT: 0.055,   // suelo absoluto de cualquier texto
  FOOT: 0.06,        // pies de fecha/fuente
  LABEL: 0.075,      // etiquetas en banda
  BODY_MIN: 0.055,   // apoyo mínimo
  BODY_MAX: 0.085,   // apoyo máximo
  TITLE_MIN: 0.14,   // titulares: mínimo GIGANTE
  TITLE_MAX: 0.28,   // titulares: techo normal
  MEGA_MAX: 0.42,    // cifras/lemas: techo
};

function r(v) { return Math.round(v); }

// Banda a sangre con texto centrado enorme. Sustituye al chip pequeño de v1.
function band({ W, H }, { y, h, bg, color, text, size = null, align = 'center', pad = 0.05 }) {
  const px = r(W * pad);
  return [
    { type: 'rect', x: 0, y: r(y), w: W, h: r(h), color: bg },
    {
      type: 'text', x: px, y: r(y), w: W - px * 2, h: r(h),
      text: String(text || '').toUpperCase(), font: 'display', weight: 800, color,
      align, valign: 'center', lineHeight: 1, letterSpacingEm: 0.02,
      autofit: { min: r(H * S.MIN_TEXT), max: r(H * (size || S.LABEL)), lines: 1 },
    },
  ];
}

// Etiqueta tipo chip pero XL (cuando una banda a sangre pesa demasiado).
function chipXL({ H }, { x, y, bg, color, text, size = 0.06 }) {
  return {
    type: 'chip', x: r(x), y: r(y), size: r(H * size),
    bg, color, text: String(text || ''), letterSpacing: 1.5,
  };
}

// Pie de fecha/fuente: SIEMPRE legible (nada de 3.4% como en v1).
function foot({ W, H }, { text, color, x = null, w = null, align = 'right', y = null }) {
  const pad = r(W * 0.05);
  return {
    type: 'text',
    x: x != null ? r(x) : r(W * 0.45),
    y: y != null ? r(y) : r(H * 0.875),
    w: w != null ? r(w) : r(W * 0.55) - pad,
    h: r(H * 0.08),
    text: String(text || '').toUpperCase(), font: 'text', weight: 900, color,
    align, valign: 'center', size: r(H * S.FOOT), letterSpacingEm: 0.02,
  };
}

// Titular protagonista con autofit gigante.
function title({ W, H }, { x, y, w, h, text, color, lines = 3, min = S.TITLE_MIN, max = S.TITLE_MAX, align = 'left', valign = 'center', lineHeight = 0.95 }) {
  return {
    type: 'text', x: r(x), y: r(y), w: r(w), h: r(h),
    text: String(text || '').toUpperCase(), font: 'display', weight: 800, color,
    align, valign, lineHeight, letterSpacingEm: -0.015,
    autofit: { min: r(H * min), max: r(H * max), lines },
  };
}

// Texto de apoyo (entradilla/detalle), grande y en 1-2 líneas.
function support({ W, H }, { x, y, w, h, text, color, lines = 2, min = S.BODY_MIN, max = S.BODY_MAX, align = 'left', valign = 'top', weight = 800 }) {
  return {
    type: 'text', x: r(x), y: r(y), w: r(w), h: r(h),
    text: String(text || ''), font: 'text', weight, color,
    align, valign, lineHeight: 1.08,
    autofit: { min: r(H * min), max: r(H * max), lines },
  };
}

module.exports = { S, r, band, chipXL, foot, title, support };
