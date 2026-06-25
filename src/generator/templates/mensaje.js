'use strict';
// MENSAJE / IMPACTO (#06) — afirmación rotunda a toda pantalla.
// MIGRADA al motor HTML: exporta build(card, ctx) -> Frame { background, elements }.
module.exports = {
  id: 'mensaje',
  label: 'Mensaje / Impacto (lema a pantalla)',
  hint: { title: 'El mensaje (2-5 palabras, admite punto final)', subtitle: '—', body: '—', date: '—' },
  defaultTheme: 'lima',
  logoPos: 'bl',
  build(card, ctx) {
    const { W, H, theme } = ctx;
    const pad = Math.round(W * 0.05);
    const bottomStrip = Math.round(H * 0.13);
    return {
      background: { type: 'solid', color: theme.bg },
      elements: [
        {
          type: 'text',
          x: pad, y: Math.round(H * 0.07),
          w: W - pad * 2, h: H - bottomStrip - Math.round(H * 0.07),
          text: (card.title || '').toUpperCase(),
          font: 'display', weight: 800, color: theme.text,
          align: 'left', valign: 'center',
          lineHeight: 0.92, letterSpacingEm: -0.02,
          autofit: { min: Math.round(H * 0.1), max: Math.round(H * 0.34), lines: 3 },
        },
      ],
    };
  },
};
