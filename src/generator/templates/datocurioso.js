'use strict';
// DATO CURIOSO - para frases breves o medianas, no para cifras gigantes.
// Mantiene la pegada visual de la casa, pero reserva aire para que el dato se lea.
module.exports = {
  id: 'datocurioso',
  label: 'Dato curioso (frase legible)',
  hint: { title: 'Dato principal', subtitle: 'Texto superior (encima del dato)', body: 'Detalle opcional', date: 'Fuente o fecha, opcional' },
  defaultTheme: 'lima',
  logoPos: 'bl',
  build(card, ctx) {
    const { W, H, theme } = ctx;
    const pad = Math.round(W * 0.055);
    const els = [];
    const label = String(card.subtitle || 'DATO CURIOSO').trim();
    const title = String(card.title || card.body || '').trim();
    const rawBody = String(card.body || '').trim();
    const body = rawBody && rawBody !== title && rawBody.toLowerCase() !== label.toLowerCase() ? rawBody : '';
    const footer = String(card.date || '').trim();
    const stripH = Math.round(H * 0.16);
    const labelX = Math.max(pad, Math.round(W * 0.095));

    els.push({ type: 'rect', x: 0, y: 0, w: W, h: H, color: theme.bg });
    els.push({ type: 'rect', x: 0, y: 0, w: W, h: stripH, color: theme.accent });
    els.push({
      type: 'text', x: labelX, y: 0, w: W - labelX - pad, h: stripH,
      text: label.toUpperCase(), font: 'display', weight: 800, color: theme.accentText,
      align: 'left', valign: 'center', letterSpacingEm: 0.03,
      autofit: { min: Math.round(H * 0.045), max: Math.round(H * 0.078), lines: 1 },
    });

    els.push({
      type: 'text', x: pad, y: stripH + Math.round(H * 0.055), w: W - pad * 2, h: Math.round(H * (body ? 0.48 : 0.56)),
      text: title.toUpperCase(), font: 'display', weight: 800, color: theme.text,
      align: 'left', valign: 'top', lineHeight: 0.94,
      autofit: { min: Math.round(H * 0.055), max: Math.round(H * 0.135), lines: 4 },
    });

    if (body) {
      els.push({
        type: 'text', x: pad, y: Math.round(H * 0.72), w: W - pad * 2, h: Math.round(H * 0.095),
        text: body.toUpperCase(), font: 'text', weight: 800, color: theme.text,
        align: 'left', valign: 'center', lineHeight: 1.08,
        autofit: { min: Math.round(H * 0.032), max: Math.round(H * 0.052), lines: 2 },
      });
    }

    els.push({ type: 'rect', x: pad, y: Math.round(H * 0.83), w: Math.round(W * 0.12), h: Math.max(6, Math.round(H * 0.011)), color: theme.accent, radius: 3 });
    if (footer) {
      els.push({
        type: 'text', x: Math.round(W * 0.32), y: Math.round(H * 0.84), w: Math.round(W * 0.63), h: Math.round(H * 0.07),
        text: footer.toUpperCase(), font: 'text', weight: 800, color: theme.text,
        align: 'right', valign: 'center', size: Math.round(H * 0.036),
      });
    }

    return { background: { type: 'solid', color: theme.bg }, elements: els };
  },
};
