'use strict';
// EVENTO — nombre del evento + FECHA/HORA protagonista + lugar. Foto opcional.
module.exports = {
  id: 'evento',
  label: 'Evento (fecha protagonista)',
  hint: { title: 'Nombre del evento', subtitle: 'Tipo: CONCIERTO, FERIA…', body: 'Lugar (1 línea)', date: 'Fecha y hora (protagonista)' },
  defaultTheme: 'lima',
  logoPos: 'tr',
  frame(card, ctx) {
    const { W, H, font, fontDisplay, lib, theme } = ctx;
    const pad = Math.round(W * 0.055);
    const maxW = W - pad * 2;
    const accent = theme.accent;
    const hasPhoto = Boolean(card.photo);
    const text = hasPhoto ? '#ffffff' : theme.text;
    const soft = hasPhoto ? 'rgba(255,255,255,0.9)' : theme.textMuted;

    // Chip de tipo.
    let chip = '';
    let topY = Math.round(H * 0.16);
    if (card.subtitle) {
      const cs = Math.round(H * 0.032);
      const c = lib.chip(card.subtitle, { x: pad, top: topY, size: cs, font, fill: accent, textFill: theme.accentText, letterSpacing: 2 });
      chip = c.svg;
      topY += c.h + Math.round(H * 0.03);
    }

    // Nombre del evento.
    const title = lib.fitText((card.title || '').toUpperCase(), { maxWidth: maxW, maxLines: 3, maxSize: Math.round(H * 0.12), minSize: Math.round(H * 0.05), weight: 800 });
    const titleSvg = lib.textBlock(title.lines, { x: pad, y: topY + title.size, size: title.size, font: fontDisplay, weight: 800, fill: text, lineHeight: 1.05 });
    let y = topY + lib.blockHeight(title.lines.length, title.size, 1.05);

    // FECHA protagonista en acento.
    let dateSvg = '';
    if (card.date) {
      const d = lib.fitText(card.date.toUpperCase(), { maxWidth: maxW, maxLines: 2, maxSize: Math.round(H * 0.085), minSize: Math.round(H * 0.04), weight: 800 });
      y += Math.round(H * 0.05) + d.size;
      dateSvg = lib.textBlock(d.lines, { x: pad, y, size: d.size, font: fontDisplay, weight: 800, fill: accent, lineHeight: 1.05, letterSpacing: 1 });
      y += lib.blockHeight(d.lines.length, d.size, 1.05) - d.size;
    }

    // Lugar.
    let placeSvg = '';
    if (card.body) {
      const p = lib.fitText(card.body, { maxWidth: maxW, maxLines: 1, maxSize: Math.round(H * 0.045), minSize: Math.round(H * 0.028), weight: 500 });
      y += Math.round(H * 0.04) + p.size;
      placeSvg = lib.textBlock([p.lines[0]], { x: pad, y, size: p.size, font, weight: 500, fill: soft });
    }

    const scrims = hasPhoto
      ? `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#ov)"/>`
      : '';
    const svg =
      `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
        <defs>${lib.linearGradient('ov', [{ o: '0%', c: 'rgba(0,0,0,0.45)' }, { o: '100%', c: 'rgba(0,0,0,0.9)' }])}
          ${lib.linearGradient('g', [{ o: '0%', c: theme.bg }, { o: '100%', c: theme.bg2 }])}</defs>
        ${hasPhoto ? '' : `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#g)"/>`}
        ${scrims}
        <rect x="${pad}" y="${Math.round(H * 0.13)}" width="${Math.round(W * 0.1)}" height="6" fill="${accent}"/>
        ${chip}${titleSvg}${dateSvg}${placeSvg}
      </svg>`;

    return { base: hasPhoto ? { photo: true, solid: theme.bg } : { solid: theme.bg }, svg };
  },
};
