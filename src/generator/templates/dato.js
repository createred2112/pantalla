'use strict';
// DATO — cifra gigante + etiqueta + contexto. Bloque centrado. Motor HTML.
module.exports = {
  id: 'dato',
  label: 'Dato / Cifra (número gigante)',
  hint: { title: 'La cifra (p. ej. 72%, 1.240, 28º)', subtitle: 'Qué mide (1 línea)', body: 'Contexto (1 línea, opcional)', date: 'Actualizado (opcional)' },
  defaultTheme: 'lima',
  logoPos: 'bl',
  build(card, ctx) {
    const { W, H, theme } = ctx;
    const pad = Math.round(W * 0.06);
    const w = W - pad * 2;
    const dateZone = card.date ? Math.round(H * 0.10) : Math.round(H * 0.04);
    const areaTop = Math.round(H * 0.13);
    const areaBottom = H - dateZone;
    const gap = Math.round(H * 0.022);
    const numH = Math.round(H * 0.4);
    const ruleH = Math.max(5, Math.round(H * 0.008));
    const labelH = Math.round(H * 0.12);
    const bodyH = card.body ? Math.round(H * 0.06) : 0;
    const blockH = numH + gap + ruleH + gap + labelH + (card.body ? gap * 0.6 + bodyH : 0);
    let y = Math.round(areaTop + (areaBottom - areaTop - blockH) / 2);

    const els = [];
    els.push({ type: 'text', x: pad, y, w, h: numH, text: (card.title || '').toUpperCase(), font: 'display', weight: 800, color: theme.text, align: 'center', valign: 'center', lineHeight: 1, letterSpacingEm: -0.01, autofit: { min: Math.round(H * 0.12), max: Math.round(H * 0.4), lines: 1 } });
    y += numH + gap;
    const ruleW = Math.round(W * 0.12);
    els.push({ type: 'rect', x: Math.round((W - ruleW) / 2), y, w: ruleW, h: ruleH, color: theme.accent, radius: 3 });
    y += ruleH + gap;
    els.push({ type: 'text', x: pad, y, w, h: labelH, text: (card.subtitle || '').toUpperCase(), font: 'text', weight: 700, color: theme.accent, align: 'center', valign: 'top', lineHeight: 1.1, autofit: { min: Math.round(H * 0.04), max: Math.round(H * 0.072), lines: 2 } });
    if (card.body) {
      y += labelH + gap * 0.6;
      els.push({ type: 'text', x: pad, y, w, h: bodyH, text: card.body, font: 'text', weight: 600, color: theme.textMuted, align: 'center', valign: 'top', size: Math.round(H * 0.046) });
    }
    if (card.date) {
      els.push({ type: 'text', x: pad, y: H - Math.round(H * 0.075), w, h: Math.round(H * 0.05), text: card.date.toUpperCase(), font: 'text', weight: 700, color: theme.textMuted, align: 'center', valign: 'center', size: Math.round(H * 0.034) });
    }
    return { background: { type: 'solid', color: theme.bg }, elements: els };
  },
};
