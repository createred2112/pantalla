'use strict';
// CITA — una frase entrecomillada grande + autor. Editorial, para entrevistas.
module.exports = {
  id: 'cita',
  label: 'Cita / Frase (editorial)',
  hint: { title: 'La frase entrecomillada', subtitle: 'Autor / cargo', body: '—', date: 'Fecha (opcional)' },
  logoPos: 'tr',
  defaultTheme: 'carbon',
  frame(card, ctx) {
    const { W, H, font, lib, theme } = ctx;
    const pad = Math.round(W * 0.08);
    const maxW = W - pad * 2;

    // Comilla decorativa enorme (carácter literal para máxima compatibilidad).
    const quoteSize = Math.round(H * 0.26);
    const quote = `<text x="${pad}" y="${Math.round(H * 0.28)}" font-family="${font}" font-size="${quoteSize}" font-weight="800" fill="${theme.accent}" opacity="0.9">“</text>`;

    // Frase.
    const title = lib.fitText(card.title || '', { maxWidth: maxW, maxLines: 4, maxSize: Math.round(H * 0.11), minSize: Math.round(H * 0.045), weight: 700 });
    const titleH = lib.blockHeight(title.lines.length, title.size, 1.12);
    const top = (H - titleH) / 2 + Math.round(H * 0.02);
    const titleSvg = lib.textBlock(title.lines, { x: pad, y: top + title.size, size: title.size, font, weight: 700, fill: theme.text, lineHeight: 1.12 });

    // Autor.
    let author = '';
    let y = top + titleH + Math.round(H * 0.06);
    if (card.subtitle) {
      author = `<rect x="${pad}" y="${y - Math.round(H * 0.03)}" width="${Math.round(W * 0.06)}" height="5" fill="${theme.accent}"/>` +
        lib.textBlock([card.subtitle], { x: pad, y: y + Math.round(H * 0.03), size: Math.round(H * 0.04), font, weight: 700, fill: theme.accent });
    }

    const svg =
      `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
        <defs>${lib.linearGradient('g', [{ o: '0%', c: theme.bg }, { o: '100%', c: theme.bg2 }])}</defs>
        <rect x="0" y="0" width="${W}" height="${H}" fill="url(#g)"/>
        ${quote}${titleSvg}${author}
      </svg>`;

    return { base: { solid: theme.bg }, svg };
  },
};
