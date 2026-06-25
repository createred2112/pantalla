'use strict';
// Ajuste de texto por palabras para SVG (aproximación por ancho de carácter).

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Divide `text` en líneas que caben en `maxWidth` px para una `fontSize` dada.
function wrap(text, fontSize, maxWidth, maxLines = 6) {
  if (!text) return [];
  const avgChar = fontSize * 0.55; // ancho medio aproximado por carácter
  const maxChars = Math.max(6, Math.floor(maxWidth / avgChar));
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const candidate = cur ? cur + ' ' + w : w;
    if (candidate.length <= maxChars) {
      cur = candidate;
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
    if (lines.length >= maxLines) break;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length >= maxLines) {
    // Recorta con elipsis si sobra texto.
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].replace(/.{1}$/, '…');
  }
  return lines;
}

module.exports = { wrap, escapeXml };
