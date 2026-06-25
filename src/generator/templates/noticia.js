'use strict';
// NOTICIA — chip de sección + titular en mayúsculas + entradilla breve.
// Admite foto. Wordmark abajo-izq; hora abajo-dcha.
module.exports = {
  id: 'noticia',
  label: 'Noticia (titular + entradilla)',
  hint: { title: 'Titular (2-5 palabras)', subtitle: 'Sección (chip)', body: 'Entradilla (1-2 líneas)', date: 'Hora (opcional)' },
  defaultTheme: 'carbon',
  logoPos: 'bl',
  frame(card, ctx) {
    const { W, H, font, fontDisplay, lib, theme } = ctx;
    const hasPhoto = Boolean(card.photo);
    const text = hasPhoto ? '#ffffff' : theme.text;
    const soft = hasPhoto ? 'rgba(255,255,255,0.92)' : theme.textMuted;
    const pad = Math.round(W * 0.05);
    const maxW = Math.round(W * 0.86);
    const bottomStrip = Math.round(H * 0.14);

    const bodySize = Math.round(H * 0.033);
    const title = lib.fitText((card.title || '').toUpperCase(), { maxWidth: maxW, maxLines: 3, maxSize: Math.round(H * 0.1), minSize: Math.round(H * 0.05), weight: 800, maxHeight: Math.round(H * 0.34), lineHeight: 1.0 });
    const bodyLines = card.body ? lib.wrapByWidth(card.body, bodySize, maxW, 400).slice(0, 2) : [];

    // Bloque anclado por su base sobre la tira inferior.
    let y = H - bottomStrip - Math.round(H * 0.02);
    const bodyBlock = [];
    for (let i = bodyLines.length - 1; i >= 0; i--) { bodyBlock.unshift({ t: bodyLines[i], y }); y -= bodySize * 1.34; }
    if (bodyLines.length) y -= bodySize * 0.4;
    const bodySvg = bodyBlock.map((l) => lib.textBlock([l.t], { x: pad, y: Math.round(l.y), size: bodySize, font, weight: 400, fill: soft })).join('\n');

    y -= lib.blockHeight(title.lines.length, title.size, 1.04);
    const titleTop = y;
    const titleSvg = lib.textBlock(title.lines, { x: pad, y: titleTop + title.size, size: title.size, font: fontDisplay, weight: 800, fill: text, lineHeight: 1.0, letterSpacing: -title.size * 0.02 });

    let chip = '';
    if (card.subtitle) {
      const cs = Math.round(H * 0.028);
      const ctop = Math.round(titleTop - Math.round(cs * 1.95) - cs * 0.6);
      const c = lib.chip(card.subtitle, { x: pad, top: ctop, size: cs, font, fill: theme.accent, textFill: theme.accentText, letterSpacing: 1.5 });
      chip = c.svg;
    }

    const dateSvg = card.date
      ? lib.textBlock([card.date.toUpperCase()], { x: W - pad, y: H - Math.round(W * 0.045), size: Math.round(H * 0.03), font, weight: 700, fill: text, anchor: 'end', letterSpacing: 1 })
      : '';

    const bg = hasPhoto
      ? `<rect x="0" y="0" width="${W}" height="${Math.round(H * 0.2)}" fill="url(#t)"/>` +
        `<rect x="0" y="${Math.round(H * 0.4)}" width="${W}" height="${Math.round(H * 0.6)}" fill="url(#b)"/>`
      : `<rect x="0" y="0" width="${W}" height="${H}" fill="${theme.bg}"/>`;

    const svg =
      `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          ${lib.linearGradient('b', [{ o: '0%', c: 'rgba(0,0,0,0)' }, { o: '55%', c: 'rgba(0,0,0,0.5)' }, { o: '100%', c: 'rgba(0,0,0,0.9)' }])}
          ${lib.linearGradient('t', [{ o: '0%', c: 'rgba(0,0,0,0.5)' }, { o: '100%', c: 'rgba(0,0,0,0)' }])}
        </defs>
        ${bg}${chip}${titleSvg}${bodySvg}${dateSvg}
      </svg>`;

    return { base: hasPhoto ? { photo: true, solid: theme.bg } : { solid: theme.bg }, svg };
  },
};
