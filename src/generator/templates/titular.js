'use strict';
// TITULAR / FOTO + TITULAR (#02) — foto a sangre (o color plano) + titular ENORME
// que llena el lienzo, en mayúsculas, sin adornos. Wordmark abajo-izq; hora abajo-dcha.
module.exports = {
  id: 'titular',
  label: 'Titular (foto + frase grande)',
  hint: { title: 'La frase (2-5 palabras)', subtitle: '—', body: '—', date: 'Hora (opcional)' },
  defaultTheme: 'carbon',
  logoPos: 'bl',
  frame(card, ctx) {
    const { W, H, font, fontDisplay, lib, theme } = ctx;
    const hasPhoto = Boolean(card.photo);
    const pad = Math.round(W * 0.05);
    const maxW = W - pad * 2;
    const text = hasPhoto ? '#ffffff' : theme.text;
    const bottomStrip = Math.round(H * 0.13);
    const lh = 0.95;

    // Titular: el mayor tamaño que llene el alto disponible, apretado.
    const zoneTop = Math.round(H * 0.07);
    const zoneBottom = H - bottomStrip;
    const title = lib.fitText((card.title || '').toUpperCase(), {
      maxWidth: maxW, maxLines: 4, maxSize: Math.round(H * 0.24), minSize: Math.round(H * 0.07),
      weight: 800, maxHeight: zoneBottom - zoneTop, lineHeight: lh,
    });
    const titleH = lib.blockHeight(title.lines.length, title.size, lh);
    const titleTop = zoneTop + (zoneBottom - zoneTop - titleH) / 2;

    const dateSvg = card.date
      ? lib.textBlock([card.date.toUpperCase()], { x: W - pad, y: H - Math.round(W * 0.045), size: Math.round(H * 0.03), font, weight: 700, fill: text, anchor: 'end', letterSpacing: 1 })
      : '';

    const bg = hasPhoto
      ? `<rect x="0" y="0" width="${W}" height="${Math.round(H * 0.24)}" fill="url(#t)"/>` +
        `<rect x="0" y="${Math.round(H * 0.3)}" width="${W}" height="${Math.round(H * 0.7)}" fill="url(#b)"/>`
      : `<rect x="0" y="0" width="${W}" height="${H}" fill="${theme.bg}"/>`;

    const svg =
      `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          ${lib.linearGradient('b', [{ o: '0%', c: 'rgba(0,0,0,0)' }, { o: '50%', c: 'rgba(0,0,0,0.4)' }, { o: '100%', c: 'rgba(0,0,0,0.9)' }])}
          ${lib.linearGradient('t', [{ o: '0%', c: 'rgba(0,0,0,0.5)' }, { o: '100%', c: 'rgba(0,0,0,0)' }])}
        </defs>
        ${bg}
        ${lib.textBlock(title.lines, { x: pad, y: titleTop + title.size, size: title.size, font: fontDisplay, weight: 800, fill: text, lineHeight: lh, letterSpacing: -title.size * 0.02 })}
        ${dateSvg}
      </svg>`;

    return { base: { photo: true, solid: theme.bg }, svg };
  },
};
