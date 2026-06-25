'use strict';
// ALERTA / BREAKING — última hora. Etiqueta arriba-izq (caja de acento),
// titular gigante en mayúsculas, wordmark abajo-izq, hora abajo-dcha.
module.exports = {
  id: 'alerta',
  label: 'Alerta / Última hora',
  hint: { title: 'El titular (2-5 palabras)', subtitle: 'Etiqueta: ÚLTIMA HORA, TRÁFICO…', body: 'Detalle (1 línea, opcional)', date: 'Hora (opcional)' },
  defaultTheme: 'rojo',
  logoPos: 'bl',
  frame(card, ctx) {
    const { W, H, font, fontDisplay, lib, theme } = ctx;
    const pad = Math.round(W * 0.055);
    const maxW = W - pad * 2;

    // Etiqueta superior: caja de acento con texto.
    const label = (card.subtitle || 'ÚLTIMA HORA').toUpperCase();
    const tagSize = Math.round(H * 0.04);
    const tagPad = Math.round(tagSize * 0.5);
    const tagH = Math.round(tagSize * 1.7);
    const tagTop = Math.round(H * 0.1);
    const tagW = Math.round(lib.estimateWidth(label, tagSize, 800) + label.length * 2 + tagPad * 2);
    const tag =
      `<rect x="${pad}" y="${tagTop}" width="${tagW}" height="${tagH}" fill="${theme.accent}"/>` +
      lib.textBlock([label], { x: pad + tagPad, y: tagTop + Math.round(tagH * 0.7), size: tagSize, font, weight: 800, fill: theme.accentText, letterSpacing: 2 });

    // Titular gigante.
    const bottomStrip = Math.round(H * 0.14);
    const zoneTop = tagTop + tagH;
    const zoneBottom = H - bottomStrip;
    const title = lib.fitText((card.title || '').toUpperCase(), { maxWidth: maxW, maxLines: 4, maxSize: Math.round(H * (card.body ? 0.16 : 0.2)), minSize: Math.round(H * 0.07), weight: 800, maxHeight: (zoneBottom - zoneTop) * (card.body ? 0.72 : 1), lineHeight: 0.98 });
    const titleH = lib.blockHeight(title.lines.length, title.size, 0.98);
    // Con detalle, el titular se ancla arriba para dejar sitio; sin él, centrado.
    const titleTop = card.body ? zoneTop + Math.round(H * 0.04) : zoneTop + (zoneBottom - zoneTop - titleH) / 2;

    const dateSvg = card.date
      ? lib.textBlock([card.date.toUpperCase()], { x: W - pad, y: H - Math.round(W * 0.045), size: Math.round(H * 0.032), font, weight: 800, fill: theme.text, anchor: 'end', letterSpacing: 1 })
      : '';
    // Detalle justo bajo el titular (no en la tira inferior, reservada al wordmark).
    const detail = card.body
      ? lib.textBlock([card.body], { x: pad, y: Math.round(titleTop + titleH + H * 0.06), size: Math.round(H * 0.034), font, weight: 600, fill: theme.textMuted })
      : '';

    const svg =
      `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${W}" height="${H}" fill="${theme.bg}"/>
        ${tag}
        ${lib.textBlock(title.lines, { x: pad, y: titleTop + title.size, size: title.size, font: fontDisplay, weight: 800, fill: theme.text, lineHeight: 0.98, letterSpacing: -title.size * 0.02 })}
        ${detail}${dateSvg}
      </svg>`;

    return { base: { solid: theme.bg }, svg };
  },
};
