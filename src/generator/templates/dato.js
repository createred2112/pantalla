'use strict';
// DATO — una cifra GIGANTE + su etiqueta. Para aforos, temperatura, %, conteos.
// Una sola idea numérica, lectura instantánea desde lejos.
module.exports = {
  id: 'dato',
  label: 'Dato / Cifra (número gigante)',
  hint: { title: 'La cifra (p. ej. 72%, 1.240, 28°)', subtitle: 'Qué mide (1 línea)', body: 'Contexto (1 línea, opcional)', date: 'Actualizado (opcional)' },
  defaultTheme: 'lima',
  frame(card, ctx) {
    const { W, H, font, fontDisplay, lib, theme } = ctx;
    const pad = Math.round(W * 0.06);
    const maxW = W - pad * 2;

    const num = lib.fitText(card.title || '', { maxWidth: maxW, maxLines: 1, maxSize: Math.round(H * 0.42), minSize: Math.round(H * 0.12), weight: 800 });
    const label = lib.fitText((card.subtitle || '').toUpperCase(), { maxWidth: maxW, maxLines: 2, maxSize: Math.round(H * 0.06), minSize: Math.round(H * 0.032), weight: 700 });
    const body = card.body
      ? lib.fitText(card.body, { maxWidth: maxW, maxLines: 1, maxSize: Math.round(H * 0.038), minSize: Math.round(H * 0.026), weight: 400 })
      : null;

    const dateZone = card.date ? Math.round(H * 0.10) : Math.round(H * 0.04);
    const areaTop = Math.round(H * 0.13);
    const areaBottom = H - dateZone;
    const gap = Math.round(H * 0.025);
    const ruleGap = Math.round(H * 0.02);
    const ruleH = Math.max(4, Math.round(H * 0.008));
    const labelH = lib.blockHeight(label.lines.length, label.size, 1.1);
    const bodyH = body ? body.size : 0;
    const blockH = num.size + ruleGap + ruleH + gap + labelH + (body ? gap * 0.8 + bodyH : 0);

    let y = areaTop + (areaBottom - areaTop - blockH) / 2 + num.size;
    const numSvg = lib.textBlock([num.lines[0] || ''], { x: W / 2, y, size: num.size, font: fontDisplay, weight: 800, fill: theme.text, anchor: 'middle' });

    const ruleW = Math.round(W * 0.12);
    const ruleY = Math.round(y + ruleGap);
    const rule = `<rect x="${(W - ruleW) / 2}" y="${ruleY}" width="${ruleW}" height="${ruleH}" rx="3" fill="${theme.accent}"/>`;

    y = ruleY + ruleH + gap + label.size;
    const labelSvg = lib.textBlock(label.lines, { x: W / 2, y, size: label.size, font, weight: 700, fill: theme.accent, anchor: 'middle', lineHeight: 1.1, letterSpacing: 1 });

    let bodySvg = '';
    if (body) {
      y += (labelH - label.size) + gap * 0.8 + body.size;
      bodySvg = lib.textBlock([body.lines[0]], { x: W / 2, y, size: body.size, font, weight: 400, fill: theme.textMuted, anchor: 'middle' });
    }

    const dateSvg = card.date
      ? lib.textBlock([card.date.toUpperCase()], { x: W / 2, y: H - Math.round(H * 0.04), size: Math.round(H * 0.026), font, weight: 600, fill: theme.textMuted, anchor: 'middle', letterSpacing: 2 })
      : '';

    const svg =
      `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
        <defs>${lib.linearGradient('g', [{ o: '0%', c: theme.bg }, { o: '100%', c: theme.bg2 }])}</defs>
        <rect x="0" y="0" width="${W}" height="${H}" fill="url(#g)"/>
        ${numSvg}${rule}${labelSvg}${bodySvg}${dateSvg}
      </svg>`;

    return { base: { solid: theme.bg }, svg };
  },
};
