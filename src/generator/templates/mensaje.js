'use strict';
// MENSAJE / IMPACTO — afirmación rotunda a toda pantalla, en mayúsculas, a sangre.
// Réplica de la plantilla #06: solo texto gigante + wordmark. Sin chips ni adornos.
// `card.subtitle` activa una flecha opcional abajo-dcha (estilo "¡EVENTOS!").
module.exports = {
  id: 'mensaje',
  label: 'Mensaje / Impacto (lema a pantalla)',
  hint: { title: 'El mensaje (2-5 palabras, admite punto final)', subtitle: 'Escribe "flecha" para añadir flecha', body: '—', date: '—' },
  defaultTheme: 'lima',
  logoPos: 'bl',
  frame(card, ctx) {
    const { W, H, fontDisplay, lib, theme } = ctx;
    const pad = Math.round(W * 0.05);
    const maxW = W - pad * 2;
    const bottomStrip = Math.round(H * 0.13);

    // Titular a sangre: el mayor tamaño posible, interlineado e interletraje apretados.
    const lh = 0.92;
    const zoneTop = Math.round(H * 0.08);
    const zoneBottom = H - bottomStrip;
    const title = lib.fitText((card.title || '').toUpperCase(), { maxWidth: maxW, maxLines: 3, maxSize: Math.round(H * 0.34), minSize: Math.round(H * 0.1), weight: 800, maxHeight: zoneBottom - zoneTop, lineHeight: lh });
    const titleH = lib.blockHeight(title.lines.length, title.size, lh);
    const titleTop = zoneTop + (zoneBottom - zoneTop - titleH) / 2;
    const titleSvg = lib.textBlock(title.lines, {
      x: pad, y: titleTop + title.size, size: title.size, font: fontDisplay,
      weight: 800, fill: theme.text, lineHeight: lh, letterSpacing: -title.size * 0.02,
    });

    // Flecha opcional abajo-dcha.
    let arrow = '';
    if (/flecha|arrow/i.test(card.subtitle || '')) {
      const ax = W - pad; const ay = H - Math.round(H * 0.07); const as = Math.round(H * 0.07); const sw = Math.round(as * 0.18);
      arrow =
        `<line x1="${ax - as}" y1="${ay}" x2="${ax}" y2="${ay - as}" stroke="${theme.text}" stroke-width="${sw}" stroke-linecap="round"/>` +
        `<polyline points="${ax - as * 0.5},${ay - as} ${ax},${ay - as} ${ax},${ay - as * 0.5}" fill="none" stroke="${theme.text}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }

    const svg =
      `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${W}" height="${H}" fill="${theme.bg}"/>
        ${titleSvg}${arrow}
      </svg>`;

    return { base: { solid: theme.bg }, svg };
  },
};
