'use strict';
// Utilidades compartidas por las plantillas: escape XML, ajuste de texto que
// AGRANDA la tipografía hasta llenar el espacio (filosofía: máximo impacto,
// mínimo texto, lectura de un vistazo).

// Escala global de texto (control desde Ajustes). Afecta a fitText y chip.
let SCALE = 1;
function setScale(s) { SCALE = (typeof s === 'number' && s > 0.3 && s < 3) ? s : 1; }

function escapeXml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// Ancho aproximado de un texto en px (heurística por peso de fuente).
// Factores algo holgados para mayúsculas en negrita (evita desbordes).
function estimateWidth(text, size, weight = 700) {
  const f = weight >= 800 ? 0.62 : weight >= 600 ? 0.58 : 0.55;
  return String(text).length * size * f;
}

// Parte el texto en líneas que caben en maxWidth (sin truncar).
function wrapByWidth(text, size, maxWidth, weight = 700) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const cand = cur ? cur + ' ' + w : w;
    if (!cur || estimateWidth(cand, size, weight) <= maxWidth) cur = cand;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Elige el MAYOR tamaño de fuente que encaja el texto en maxLines dentro del
// ancho dado y, si se indica, dentro de maxHeight (alto total del bloque).
// Devuelve { lines, size }.
function fitText(text, { maxWidth, maxLines = 3, maxSize, minSize = 22, weight = 800, maxHeight, lineHeight = 1.0 }) {
  maxSize = Math.round(maxSize * SCALE);
  minSize = Math.round(minSize * SCALE);
  for (let size = maxSize; size >= minSize; size -= 2) {
    const lines = wrapByWidth(text, size, maxWidth, weight);
    const longest = lines.reduce((m, l) => Math.max(m, estimateWidth(l, size, weight)), 0);
    const fitsW = lines.length <= maxLines && longest <= maxWidth;
    const fitsH = !maxHeight || blockHeight(lines.length, size, lineHeight) <= maxHeight;
    if (fitsW && fitsH) return { lines, size };
  }
  const lines = wrapByWidth(text, minSize, maxWidth, weight).slice(0, maxLines);
  return { lines, size: minSize };
}

// Emite un bloque de líneas <text>. `y` es la línea base de la PRIMERA línea.
function textBlock(lines, opts) {
  const {
    x, y, size, font, weight = 700, fill = '#fff',
    anchor = 'start', lineHeight = 1.08, letterSpacing = 0, upper = false,
  } = opts;
  return lines.map((ln, i) => {
    const t = upper ? String(ln).toUpperCase() : ln;
    return `<text x="${x}" y="${Math.round(y + i * size * lineHeight)}" ` +
      `font-family="${font}" font-size="${size}" font-weight="${weight}" ` +
      `text-anchor="${anchor}"${letterSpacing ? ` letter-spacing="${letterSpacing}"` : ''} ` +
      `fill="${fill}">${escapeXml(t)}</text>`;
  }).join('\n');
}

// Degradado lineal reutilizable (devuelve <linearGradient> con id dado).
function linearGradient(id, stops, vertical = true) {
  const coords = vertical ? 'x1="0" y1="0" x2="0" y2="1"' : 'x1="0" y1="0" x2="1" y2="0"';
  const s = stops.map((st) => `<stop offset="${st.o}" stop-color="${st.c}"/>`).join('');
  return `<linearGradient id="${id}" ${coords}>${s}</linearGradient>`;
}

// Altura total (px) de un bloque de líneas.
function blockHeight(lineCount, size, lineHeight = 1.08) {
  return lineCount > 0 ? (lineCount - 1) * size * lineHeight + size : 0;
}

// Chip/etiqueta de color (mayúsculas). Devuelve { svg, w, h }. El ancho se
// sobreestima (factor de peso 800) para que el texto nunca rebose la pastilla.
function chip(label, { x, top, size, font, fill, textFill, letterSpacing = 1.5 }) {
  size = Math.round(size * SCALE);
  const text = String(label).toUpperCase();
  const px = Math.round(size * 0.72);
  const h = Math.round(size * 1.95);
  const w = Math.round(estimateWidth(text, size, 800) + Math.max(0, text.length - 1) * letterSpacing + px * 2);
  const svg =
    `<rect x="${x}" y="${top}" width="${w}" height="${h}" rx="${Math.round(h * 0.16)}" fill="${fill}"/>` +
    `<text x="${x + px}" y="${top + Math.round(h * 0.69)}" font-family="${font}" font-size="${size}" ` +
    `font-weight="700" letter-spacing="${letterSpacing}" fill="${textFill}">${escapeXml(text)}</text>`;
  return { svg, w, h };
}

module.exports = { escapeXml, estimateWidth, wrapByWidth, fitText, textBlock, linearGradient, blockHeight, chip, setScale };
