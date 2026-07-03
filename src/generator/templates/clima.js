'use strict';
// CLIMA / TIEMPO — icono (izq) + columna HOY/24ºC/SOLEADO (dcha). Motor HTML.

function keyOf(text) {
  const t = String(text || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  if (/torment|rayo/.test(t)) return 'tormenta';
  if (/niev|nevad/.test(t)) return 'nieve';
  if (/lluv|llovizn|chubas|aguac/.test(t)) return 'lluvia';
  if (/niebl|brum|calima/.test(t)) return 'niebla';
  if (/vient|rach/.test(t)) return 'viento';
  if (/cubiert|nubl|nubos/.test(t)) return 'nube';
  return 'sol';
}
// Iconos de línea profesionales (geometría Feather Icons, MIT) en 24x24,
// escalados a 100x100. Formas equilibradas y probadas, trazo redondeado.
function iconSvg(key, c) {
  const SHAPES = {
    sol: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>' +
      '<line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>' +
      '<line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>' +
      '<line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
    nube: '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>',
    lluvia: '<path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/>' +
      '<line x1="16" y1="13" x2="16" y2="21"/><line x1="8" y1="13" x2="8" y2="21"/><line x1="12" y1="15" x2="12" y2="23"/>',
    nieve: '<path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"/>' +
      '<line x1="8" y1="16" x2="8.01" y2="16"/><line x1="8" y1="20" x2="8.01" y2="20"/>' +
      '<line x1="12" y1="18" x2="12.01" y2="18"/><line x1="12" y1="22" x2="12.01" y2="22"/>' +
      '<line x1="16" y1="16" x2="16.01" y2="16"/><line x1="16" y1="20" x2="16.01" y2="20"/>',
    tormenta: '<path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9"/>' +
      '<polyline points="13 11 9 17 15 17 11 23"/>',
    viento: '<path d="M9.59 4.59A2 2 0 1 1 11 8H2"/><path d="M12.59 19.41A2 2 0 1 0 14 16H2"/><path d="M17.73 7.73A2.5 2.5 0 1 1 19.5 12H2"/>',
    niebla: '<line x1="3" y1="8" x2="21" y2="8"/><line x1="5" y1="12" x2="19" y2="12"/><line x1="3" y1="16" x2="21" y2="16"/><line x1="7" y1="20" x2="17" y2="20"/>',
  };
  const shape = SHAPES[key] || SHAPES.nube;
  return `<svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">` +
    `<g transform="translate(2 2) scale(4)" fill="none" stroke="${c}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${shape}</g></svg>`;
}

module.exports = {
  iconSvg, keyOf, // reutilizados por la plantilla "prevision"
  id: 'clima',
  label: 'Clima / Tiempo (temperatura + icono)',
  hint: { title: 'Temperatura (p. ej. 24ºC)', subtitle: 'Condición: SOLEADO, LLUVIA…', body: 'Máx/Mín (opcional)', date: 'Cuándo: HOY, MAÑANA…' },
  defaultTheme: 'azul',
  logoPos: 'bl',
  build(card, ctx) {
    const { W, H, theme } = ctx;
    const pad = Math.round(W * 0.05);
    const els = [];

    // Chip con el lugar/momento arriba a la izquierda.
    if (card.date) {
      els.push({ type: 'chip', x: pad, y: Math.round(H * 0.065), size: Math.round(H * 0.042), bg: theme.accent, color: theme.accentText, text: card.date, letterSpacing: 2 });
    }

    // TEMPERATURA gigante a la izquierda + ICONO al mismo peso a la derecha:
    // dos protagonistas equilibrados, no una columna con un adorno.
    const zoneY = Math.round(H * 0.165);
    const zoneH = Math.round(H * 0.475);
    els.push({
      type: 'text', x: pad, y: zoneY, w: Math.round(W * 0.5), h: zoneH,
      text: (card.title || '').toUpperCase(), font: 'display', weight: 800, color: theme.text,
      align: 'left', valign: 'center', lineHeight: 1, letterSpacingEm: -0.02,
      autofit: { min: Math.round(H * 0.22), max: Math.round(H * 0.44), lines: 1 },
    });
    const icoKey = keyOf(card.subtitle);
    // Ajustable desde el panel (Ajustes → Icono del tiempo): tamaño y posición.
    const conf = (ctx.brand && ctx.brand.climaIcon) || {};
    const scale = Math.max(40, Math.min(140, Number(conf.scale) || 100)) / 100;
    // Nunca más alto que su zona (antes desbordaba 540px en 513px: descolgado).
    const icoS = Math.round(Math.min(zoneH, Math.round(W * 0.32)) * scale);
    const icoX = Math.round(W - pad - icoS - W * 0.03 + W * ((Number(conf.dx) || 0) / 100));
    const icoY = Math.round(zoneY + (zoneH - icoS) / 2 + H * ((Number(conf.dy) || 0) / 100));
    els.push({
      type: 'svg', anim: icoKey === 'sol' ? 'spin' : 'float', // el sol gira, el resto flota
      x: icoX, y: icoY, w: icoS, h: icoS, svg: iconSvg(icoKey, theme.accent),
    });

    // Banda de acento a sangre (firma de la casa) con la condición y máx/mín.
    const bandTxt = [card.subtitle, card.body].filter(Boolean).join('  ·  ');
    if (bandTxt) {
      const bandY = Math.round(H * 0.67);
      const bandH = Math.round(H * 0.14);
      els.push({ type: 'rect', x: 0, y: bandY, w: W, h: bandH, color: theme.accent });
      els.push({
        type: 'text', x: pad, y: bandY, w: W - pad * 2, h: bandH,
        text: bandTxt.toUpperCase(), font: 'display', weight: 800, color: theme.accentText,
        align: 'center', valign: 'center', lineHeight: 1, letterSpacingEm: 0.02,
        autofit: { min: Math.round(H * 0.04), max: Math.round(H * 0.072), lines: 1 },
      });
    }

    return { background: { type: 'solid', color: theme.bg }, elements: els };
  },
};
