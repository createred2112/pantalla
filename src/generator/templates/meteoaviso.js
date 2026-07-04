'use strict';
// AVISO METEOROLOGICO - alerta clara para calor, tormentas, viento, nieve...
// Pensada para mensajes programados desde Escaleta y consejos de autoproteccion.
module.exports = {
  id: 'meteoaviso',
  label: 'Aviso meteorologico',
  hint: {
    title: 'Nivel: ALERTA NARANJA, AMARILLA...',
    subtitle: 'Riesgo: temperaturas extremas, tormentas...',
    body: 'Mensaje o consejos principales',
    date: 'Vigencia o fuente',
  },
  defaultTheme: 'naranja',
  logoPos: 'bl',
  build(card, ctx) {
    const { W, H, theme } = ctx;
    const pad = Math.round(W * 0.055);
    const title = String(card.title || 'AVISO METEOROLOGICO').trim();
    const subtitle = String(card.subtitle || 'METEOROLOGIA').trim();
    const body = String(card.body || '').trim();
    const date = String(card.date || '').trim();
    const els = [];
    const bg = card.color || theme.bg;
    const ink = theme.text || '#0E0E0E';
    const accent = theme.accent || '#0E0E0E';
    const accentText = theme.accentText || '#FFFFFF';

    els.push({ type: 'rect', x: 0, y: 0, w: W, h: H, color: bg });
    els.push({ type: 'rect', x: 0, y: 0, w: W, h: Math.round(H * 0.055), color: accent });
    els.push({ type: 'rect', x: 0, y: Math.round(H * 0.055), w: W, h: Math.round(H * 0.012), color: accentText });

    els.push({
      type: 'chip',
      x: pad,
      y: Math.round(H * 0.105),
      size: Math.round(H * 0.043),
      bg: accent,
      color: accentText,
      text: subtitle.toUpperCase(),
      radius: Math.round(H * 0.012),
      letterSpacing: 1.4,
    });

    els.push({
      type: 'text',
      x: pad,
      y: Math.round(H * 0.205),
      w: W - pad * 2,
      h: Math.round(H * 0.31),
      text: title.toUpperCase(),
      font: 'display',
      weight: 800,
      color: ink,
      align: 'left',
      valign: 'center',
      lineHeight: 0.95,
      autofit: { min: Math.round(H * 0.09), max: Math.round(H * 0.19), lines: 2 },
    });

    if (body) {
      els.push({ type: 'rect', x: pad, y: Math.round(H * 0.57), w: Math.round(W * 0.12), h: Math.max(7, Math.round(H * 0.012)), color: accent, radius: 3 });
      els.push({
        type: 'text',
        x: pad,
        y: Math.round(H * 0.615),
        w: W - pad * 2,
        h: Math.round(H * 0.17),
        text: body,
        font: 'text',
        weight: 800,
        color: ink,
        align: 'left',
        valign: 'top',
        lineHeight: 1.08,
        autofit: { min: Math.round(H * 0.04), max: Math.round(H * 0.067), lines: 3 },
      });
    }

    if (date) {
      els.push({
        type: 'text',
        x: Math.round(W * 0.37),
        y: Math.round(H * 0.875),
        w: Math.round(W * 0.58),
        h: Math.round(H * 0.07),
        text: date.toUpperCase(),
        font: 'text',
        weight: 900,
        color: ink,
        align: 'right',
        valign: 'center',
        size: Math.round(H * 0.038),
      });
    }

    return { background: { type: 'solid', color: bg }, elements: els };
  },
};
