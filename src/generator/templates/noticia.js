'use strict';
// NOTICIA — chip + titular + entradilla + hora. Admite foto. Motor HTML.
module.exports = {
  id: 'noticia',
  label: 'Noticia (titular + entradilla)',
  hint: { title: 'Titular (2-5 palabras)', subtitle: 'Sección (chip)', body: 'Entradilla (1-2 líneas)', date: 'Hora (opcional)' },
  defaultTheme: 'carbon',
  logoPos: 'bl',
  build(card, ctx) {
    const { W, H, theme, hasPhoto } = ctx;
    const pad = Math.round(W * 0.05);
    const strip = Math.round(H * 0.16);
    const text = hasPhoto ? '#ffffff' : theme.text;
    const soft = hasPhoto ? 'rgba(255,255,255,0.92)' : theme.textMuted;
    const els = [];

    if (hasPhoto) {
      els.push({ type: 'rect', x: 0, y: 0, w: W, h: Math.round(H * 0.22), gradient: 'linear-gradient(180deg, rgba(0,0,0,0.5), rgba(0,0,0,0))' });
      els.push({ type: 'rect', x: 0, y: Math.round(H * 0.45), w: W, h: Math.round(H * 0.55), gradient: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.5) 55%, rgba(0,0,0,0.9) 100%)' });
    }

    const bottomY = H - strip - Math.round(H * 0.02);
    const bodyH = card.body ? Math.round(H * 0.12) : 0;
    const bodyY = bottomY - bodyH;
    const titleH = Math.round(H * 0.24);
    const titleY = bodyY - Math.round(H * 0.012) - titleH;

    if (card.subtitle) {
      els.push({ type: 'chip', x: pad, y: titleY - Math.round(H * 0.07), size: Math.round(H * 0.036), bg: theme.accent, color: theme.accentText, text: card.subtitle, letterSpacing: 1.5 });
    }
    els.push({
      type: 'text', x: pad, y: titleY, w: Math.round(W * 0.88), h: titleH,
      text: (card.title || '').toUpperCase(), font: 'display', weight: 800, color: text,
      align: 'left', valign: 'bottom', lineHeight: 1.0, letterSpacingEm: -0.02,
      autofit: { min: Math.round(H * 0.05), max: Math.round(H * 0.092), lines: 3 },
    });
    if (card.body) {
      els.push({ type: 'text', x: pad, y: bodyY, w: Math.round(W * 0.82), h: bodyH, text: card.body, font: 'text', weight: 700, color: soft, align: 'left', valign: 'top', size: Math.round(H * 0.05), lineHeight: 1.12 });
    }
    if (card.date) {
      els.push({ type: 'text', x: Math.round(W * 0.58), y: H - strip + Math.round(H * 0.025), w: Math.round(W * 0.42) - pad, h: Math.round(H * 0.08), text: card.date.toUpperCase(), font: 'text', weight: 900, color: text, align: 'right', valign: 'center', size: Math.round(H * 0.048) });
    }

    return { background: { type: hasPhoto ? 'photo' : 'solid', color: theme.bg }, elements: els };
  },
};
