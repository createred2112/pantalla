'use strict';
// DATO — la pieza insignia del sistema: CIFRA a media pantalla + BANDA de
// acento a todo el ancho con la etiqueta dentro. Lectura en 2 segundos incluso
// a baja resolución: primero el número, luego la banda de color dice qué es.
// Si el título es una frase (no una cifra), envuelve en hasta 3 líneas grandes.
module.exports = {
  id: 'dato',
  label: 'Dato / Cifra (número gigante)',
  hint: { title: 'La cifra (p. ej. 72%, 1.240, 28º)', subtitle: 'Qué mide (va en la banda)', body: 'Contexto (pie, opcional)', date: 'Actualizado (pie, opcional)' },
  defaultTheme: 'lima',
  logoPos: 'bl',
  build(card, ctx) {
    const { W, H, theme } = ctx;
    const pad = Math.round(W * 0.05);
    const w = W - pad * 2;
    const els = [];
    const title = String(card.title || '');
    const isFigure = title.replace(/\s+/g, '').length <= 9;
    const hasBody = Boolean(String(card.body || '').trim());

    // La cifra (o frase) domina el lienzo superior.
    els.push({
      type: 'text', x: pad, y: Math.round(H * 0.05), w, h: Math.round(H * 0.58),
      text: title.toUpperCase(), font: 'display', weight: 800, color: theme.text,
      align: 'center', valign: 'center', lineHeight: isFigure ? 1 : 0.96, letterSpacingEm: -0.01,
      autofit: isFigure
        ? { min: Math.round(H * 0.16), max: Math.round(H * 0.5), lines: 1 }
        : { min: Math.round(H * 0.07), max: Math.round(H * 0.16), lines: 3 },
    });

    if (!isFigure && hasBody) {
      els.push({
        type: 'text', x: pad, y: Math.round(H * 0.47), w, h: Math.round(H * 0.16),
        text: String(card.body || '').toUpperCase(), font: 'text', weight: 800, color: theme.text,
        align: 'center', valign: 'center', lineHeight: 1.08,
        autofit: { min: Math.round(H * 0.035), max: Math.round(H * 0.07), lines: 2 },
      });
    }

    // Banda de acento a sangre: la etiqueta vive dentro. Firma visual de la casa.
    if (card.subtitle) {
      const bandY = Math.round(H * 0.67);
      const bandH = Math.round(H * 0.14);
      els.push({ type: 'rect', x: 0, y: bandY, w: W, h: bandH, color: theme.accent });
      els.push({
        type: 'text', x: pad, y: bandY, w, h: bandH,
        text: card.subtitle.toUpperCase(), font: 'display', weight: 800, color: theme.accentText,
        align: 'center', valign: 'center', lineHeight: 1, letterSpacingEm: 0.02,
        autofit: { min: Math.round(H * 0.04), max: Math.round(H * 0.075), lines: 1 },
      });
    }

    // Pie: contexto + actualización, abajo a la derecha (el logo va a la izquierda).
    const foot = [isFigure ? card.body : '', card.date].filter(Boolean).join('  ·  ');
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
