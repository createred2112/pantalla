'use strict';
// DATO — cifras o teléfonos útiles. Debe entenderse desde el primer segundo:
// etiqueta arriba, número protagonista y contexto legible sin bandas mudas.
// Si el título es una frase, envuelve en hasta 3 líneas grandes.
module.exports = {
  id: 'dato',
  label: 'Dato / Cifra (número gigante)',
  hint: { title: 'La cifra (p. ej. 72%, 1.240, 28º)', subtitle: 'Qué mide (arriba)', body: 'Contexto visible, opcional', date: 'Actualizado/fuente, opcional' },
  defaultTheme: 'lima',
  logoPos: 'bl',
  build(card, ctx) {
    const { W, H, theme } = ctx;
    const pad = Math.round(W * 0.05);
    const w = W - pad * 2;
    const els = [];
    const title = String(card.title || '');
    const subtitle = String(card.subtitle || '').trim();
    const isFigure = title.replace(/\s+/g, '').length <= 9;
    const body = String(card.body || '').trim();
    const hasBody = Boolean(body && body.toLowerCase() !== title.toLowerCase() && body.toLowerCase() !== subtitle.toLowerCase());
    const usefulSubtitle = Boolean(subtitle && !/^(gasteizberri|gasteizberri\.com)$/i.test(subtitle));
    const supportText = hasBody ? body : '';
    const titleY = isFigure ? 0.17 : (usefulSubtitle ? 0.18 : 0.08);
    const titleH = isFigure ? 0.42 : (usefulSubtitle ? 0.38 : 0.48);

    if (isFigure && subtitle) {
      els.push({
        type: 'text', x: pad, y: Math.round(H * 0.055), w, h: Math.round(H * 0.13),
        text: subtitle.toUpperCase(), font: 'display', weight: 800, color: theme.text,
        align: 'center', valign: 'center', lineHeight: 1, letterSpacingEm: 0.025,
        autofit: { min: Math.round(H * 0.045), max: Math.round(H * 0.095), lines: 1 },
      });
    }

    // La cifra (o frase) domina el lienzo central.
    els.push({
      type: 'text', x: pad, y: Math.round(H * titleY), w, h: Math.round(H * titleH),
      text: title.toUpperCase(), font: 'display', weight: 800, color: theme.text,
      align: 'center', valign: 'center', lineHeight: isFigure ? 0.92 : 0.96, letterSpacingEm: -0.01,
      autofit: isFigure
        ? { min: Math.round(H * 0.18), max: Math.round(H * 0.42), lines: 1 }
        : { min: Math.round(H * 0.07), max: Math.round(H * 0.16), lines: 3 },
    });

    if (!isFigure && usefulSubtitle) {
      els.push({
        type: 'text', x: pad, y: Math.round(H * 0.055), w, h: Math.round(H * 0.11),
        text: subtitle.toUpperCase(), font: 'display', weight: 800, color: theme.text,
        align: 'center', valign: 'center', lineHeight: 1.08,
        autofit: { min: Math.round(H * 0.04), max: Math.round(H * 0.085), lines: 1 },
      });
    }

    // Contexto visible: una regla corta basta. Evita una banda grande que pueda
    // verse vacía durante la animación o si el texto se queda sin espacio.
    if (supportText) {
      const ruleY = Math.round(H * 0.64);
      els.push({
        type: 'rect', x: Math.round(W * 0.39), y: ruleY,
        w: Math.round(W * 0.22), h: Math.max(6, Math.round(H * 0.011)),
        color: theme.accent, radius: 3,
      });
      els.push({
        type: 'text', x: pad, y: ruleY + Math.round(H * 0.03), w, h: Math.round(H * 0.13),
        text: supportText.toUpperCase(), font: 'text', weight: 900, color: theme.text,
        align: 'center', valign: 'center', lineHeight: 1.06,
        autofit: { min: Math.round(H * 0.032), max: Math.round(H * (isFigure ? 0.062 : 0.052)), lines: 2 },
      });
    }

    // Pie: actualización/fuente, abajo a la derecha (el logo va a la izquierda).
    const foot = [card.date].filter(Boolean).join('  ·  ');
    if (foot) {
      els.push({
        type: 'text', x: Math.round(W * 0.3), y: Math.round(H * 0.875), w: Math.round(W * 0.7) - pad, h: Math.round(H * 0.07),
        text: foot.toUpperCase(), font: 'text', weight: 800, color: theme.text,
        align: 'right', valign: 'center', size: Math.round(H * 0.036),
      });
    }

    return { background: { type: 'solid', color: theme.bg }, elements: els };
  },
};
