'use strict';
// NOTICIA — chip + titular + entradilla + hora. Admite foto. Motor HTML.
// Concepto: 3 segundos de lectura a distancia. El TITULAR es el protagonista
// absoluto y llena el lienzo; el resto (chip, entradilla, hora) es soporte.
module.exports = {
  id: 'noticia',
  label: 'Noticia (titular + entradilla)',
  hint: { title: 'Titular (2-5 palabras)', subtitle: 'Sección (chip)', body: 'Entradilla (1 línea)', date: 'Hora (opcional)' },
  defaultTheme: 'carbon',
  logoPos: 'bl',
  build(card, ctx) {
    const { W, H, theme, hasPhoto } = ctx;
    const pad = Math.round(W * 0.05);
    const els = [];

    if (hasPhoto) {
      // Con foto: composición anclada abajo (la foto respira arriba),
      // pero con titular mucho más presente que antes.
      const text = '#ffffff';
      const soft = 'rgba(255,255,255,0.92)';
      els.push({ type: 'rect', x: 0, y: 0, w: W, h: Math.round(H * 0.22), gradient: 'linear-gradient(180deg, rgba(0,0,0,0.5), rgba(0,0,0,0))' });
      els.push({ type: 'rect', x: 0, y: Math.round(H * 0.38), w: W, h: Math.round(H * 0.62), gradient: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.92) 100%)' });

      const strip = Math.round(H * 0.17); // reserva para logo (esquina inf. izq.)
      const bodyH = card.body ? Math.round(H * 0.085) : 0;
      const bodyY = H - strip - bodyH;
      const titleH = Math.round(H * 0.32);
      const titleY = bodyY - Math.round(H * 0.015) - titleH;

      if (card.subtitle) {
        els.push({ type: 'chip', x: pad, y: titleY - Math.round(H * 0.075), size: Math.round(H * 0.04), bg: theme.accent, color: theme.accentText, text: card.subtitle, letterSpacing: 1.5 });
      }
      els.push({
        type: 'text', x: pad, y: titleY, w: Math.round(W * 0.9), h: titleH,
        text: (card.title || '').toUpperCase(), font: 'display', weight: 800, color: text,
        align: 'left', valign: 'bottom', lineHeight: 0.98, letterSpacingEm: -0.02,
        autofit: { min: Math.round(H * 0.08), max: Math.round(H * 0.14), lines: 3 },
      });
      if (card.body) {
        els.push({
          type: 'text', x: pad, y: bodyY, w: Math.round(W * 0.84), h: bodyH,
          text: card.body, font: 'text', weight: 700, color: soft,
          align: 'left', valign: 'top', lineHeight: 1.12,
          autofit: { min: Math.round(H * 0.04), max: Math.round(H * 0.056), lines: 2 },
        });
      }
      if (card.date) {
        els.push({ type: 'text', x: Math.round(W * 0.58), y: H - strip + Math.round(H * 0.02), w: Math.round(W * 0.42) - pad, h: Math.round(H * 0.09), text: card.date.toUpperCase(), font: 'text', weight: 900, color: text, align: 'right', valign: 'center', size: Math.round(H * 0.05) });
      }
      return { background: { type: 'photo', color: theme.bg }, elements: els };
    }

    // Sin foto: PÓSTER TIPOGRÁFICO. Nada de zonas muertas: chip arriba,
    // titular gigante ocupando el centro, entradilla como apoyo y pie fino.
    const text = theme.text;
    const soft = theme.textMuted;

    if (card.subtitle) {
      els.push({ type: 'chip', x: pad, y: Math.round(H * 0.075), size: Math.round(H * 0.042), bg: theme.accent, color: theme.accentText, text: card.subtitle, letterSpacing: 1.5 });
    }

    const titleY = Math.round(H * 0.17);
    const titleH = Math.round(H * 0.45);
    els.push({
      type: 'text', x: pad, y: titleY, w: Math.round(W * 0.9), h: titleH,
      text: (card.title || '').toUpperCase(), font: 'display', weight: 800, color: text,
      align: 'left', valign: 'center', lineHeight: 0.95, letterSpacingEm: -0.02,
      autofit: { min: Math.round(H * 0.10), max: Math.round(H * 0.21), lines: 3 },
    });

    if (card.body) {
      // Barra de acento + entradilla: apoyo claro, jerarquía inequívoca.
      els.push({ type: 'rect', x: pad, y: Math.round(H * 0.665), w: Math.round(W * 0.09), h: Math.max(6, Math.round(H * 0.011)), color: theme.accent, radius: 3 });
      els.push({
        type: 'text', x: pad, y: Math.round(H * 0.70), w: Math.round(W * 0.86), h: Math.round(H * 0.115),
        text: card.body, font: 'text', weight: 700, color: soft,
        align: 'left', valign: 'top', lineHeight: 1.12,
        autofit: { min: Math.round(H * 0.042), max: Math.round(H * 0.06), lines: 2 },
      });
    }

    if (card.date) {
      els.push({ type: 'text', x: Math.round(W * 0.58), y: Math.round(H * 0.885), w: Math.round(W * 0.42) - pad, h: Math.round(H * 0.08), text: card.date.toUpperCase(), font: 'text', weight: 900, color: text, align: 'right', valign: 'center', size: Math.round(H * 0.05) });
    }

    return { background: { type: 'solid', color: theme.bg }, elements: els };
  },
};
