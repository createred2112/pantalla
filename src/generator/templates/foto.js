'use strict';
// FOTO — la imagen manda. Foto a sangre con wordmark y, opcionalmente, un pie
// breve (lower-third). Tira inferior reservada para wordmark (izq) y hora (dcha).
module.exports = {
  id: 'foto',
  label: 'Foto a pantalla completa',
  hint: { title: 'Pie de foto (opcional, corto)', subtitle: 'Etiqueta (chip, opcional)', body: '—', date: 'Hora (opcional)' },
  defaultTheme: 'carbon',
  logoPos: 'bl',
  frame(card, ctx) {
    const { W, H, font, fontDisplay, lib, theme } = ctx;
    const pad = Math.round(W * 0.055);
    const maxW = W - pad * 2;
    const bottomStrip = Math.round(H * 0.14);
    const hasCaption = Boolean(card.title || card.subtitle);

    const topScrim = `<rect x="0" y="0" width="${W}" height="${Math.round(H * 0.2)}" fill="url(#t)"/>`;

    let lower = '';
    if (hasCaption) {
      const title = card.title
        ? lib.fitText((card.title || '').toUpperCase(), { maxWidth: maxW, maxLines: 2, maxSize: Math.round(H * 0.075), minSize: Math.round(H * 0.04), weight: 800 })
        : null;
      const titleH = title ? lib.blockHeight(title.lines.length, title.size, 1.05) : 0;

      let y = H - bottomStrip - Math.round(H * 0.02);
      const titleTop = title ? y - titleH : y;

      let chip = '';
      if (card.subtitle) {
        const cs = Math.round(H * 0.028);
        const c = lib.chip(card.subtitle, { x: pad, top: titleTop - Math.round(cs * 1.95) - Math.round(H * 0.018), size: cs, font, fill: theme.accent, textFill: theme.accentText, letterSpacing: 1.5 });
        chip = c.svg;
      }
      const titleSvg = title
        ? lib.textBlock(title.lines, { x: pad, y: titleTop + title.size, size: title.size, font: fontDisplay, weight: 800, fill: '#ffffff', lineHeight: 1.05 })
        : '';
      lower = `<rect x="0" y="${Math.round(H * 0.5)}" width="${W}" height="${Math.round(H * 0.5)}" fill="url(#b)"/>${chip}${titleSvg}`;
    }

    const dateSvg = card.date
      ? lib.textBlock([card.date.toUpperCase()], { x: W - pad, y: H - Math.round(W * 0.045), size: Math.round(H * 0.03), font, weight: 700, fill: '#ffffff', anchor: 'end', letterSpacing: 1 })
      : '';

    const svg =
      `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          ${lib.linearGradient('b', [{ o: '0%', c: 'rgba(0,0,0,0)' }, { o: '100%', c: 'rgba(0,0,0,0.85)' }])}
          ${lib.linearGradient('t', [{ o: '0%', c: 'rgba(0,0,0,0.45)' }, { o: '100%', c: 'rgba(0,0,0,0)' }])}
        </defs>
        ${topScrim}${lower}${dateSvg}
      </svg>`;

    return { base: { photo: true, solid: theme.bg }, svg };
  },
};
