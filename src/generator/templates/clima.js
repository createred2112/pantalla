'use strict';
// CLIMA / TIEMPO — icono (izq) + columna HOY/24ºC/SOLEADO (dcha). Motor HTML.

function keyOf(text) {
  const t = String(text || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  if (/torment|rayo/.test(t)) return 'tormenta';
  if (/niev|nevad/.test(t)) return 'nieve';
  if (/lluv|chubas|aguac/.test(t)) return 'lluvia';
  if (/niebl|brum|calima/.test(t)) return 'niebla';
  if (/vient|rach/.test(t)) return 'viento';
  if (/cubiert|nubl|nubos/.test(t)) return 'nube';
  return 'sol';
}
// Iconos de línea monocromos en viewBox 100x100.
function iconSvg(key, c) {
  const sw = 7;
  const cloud = (cx, cy, s) => `<path d="M ${cx - s * 0.55} ${cy + s * 0.3} a ${s * 0.3} ${s * 0.3} 0 0 1 ${s * 0.02} ${-s * 0.58} a ${s * 0.34} ${s * 0.34} 0 0 1 ${s * 0.62} ${-s * 0.04} a ${s * 0.26} ${s * 0.26} 0 0 1 ${s * 0.5} ${s * 0.18} a ${s * 0.24} ${s * 0.24} 0 0 1 ${-s * 0.12} ${s * 0.46} Z" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linejoin="round"/>`;
  let inner = '';
  if (key === 'sol') {
    let rays = '';
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; rays += `<line x1="${50 + Math.cos(a) * 30}" y1="${48 + Math.sin(a) * 30}" x2="${50 + Math.cos(a) * 44}" y2="${48 + Math.sin(a) * 44}" stroke="${c}" stroke-width="${sw}" stroke-linecap="round"/>`; }
    inner = `<circle cx="50" cy="48" r="20" fill="none" stroke="${c}" stroke-width="${sw}"/>${rays}`;
  } else if (key === 'nube') { inner = cloud(50, 45, 40); }
  else if (key === 'lluvia') { inner = cloud(50, 38, 40) + [-1, 0, 1].map((i) => `<line x1="${50 + i * 14}" y1="72" x2="${50 + i * 14 - 4}" y2="88" stroke="${c}" stroke-width="${sw}" stroke-linecap="round"/>`).join(''); }
  else if (key === 'nieve') { inner = cloud(50, 38, 40) + [-1, 0, 1].map((i) => `<circle cx="${50 + i * 14}" cy="80" r="4" fill="${c}"/>`).join(''); }
  else if (key === 'tormenta') { inner = cloud(50, 38, 40) + `<polygon points="50,70 60,70 52,84 60,84 44,100 49,78 42,78" fill="${c}"/>`; }
  else if (key === 'niebla') { inner = [0, 1, 2, 3].map((i) => `<rect x="${18 + (i % 2) * 8}" y="${30 + i * 14}" width="${64 - (i % 2) * 18}" height="${sw}" rx="3" fill="${c}"/>`).join(''); }
  else if (key === 'viento') { inner = [-15, 5, 25].map((yy, i) => `<path d="M 16 ${50 + yy} h ${56 - i * 8} a 10 10 0 1 0 -8 10" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round"/>`).join(''); }
  return `<svg viewBox="0 0 100 100" width="100%" height="100%">${inner}</svg>`;
}

module.exports = {
  id: 'clima',
  label: 'Clima / Tiempo (temperatura + icono)',
  hint: { title: 'Temperatura (p. ej. 24ºC)', subtitle: 'Condición: SOLEADO, LLUVIA…', body: 'Máx/Mín (opcional)', date: 'Cuándo: HOY, MAÑANA…' },
  defaultTheme: 'azul',
  logoPos: 'bl',
  build(card, ctx) {
    const { W, H, theme } = ctx;
    const pad = Math.round(W * 0.05);
    const els = [];
    // Icono a la izquierda.
    const icoS = Math.round(H * 0.34);
    els.push({ type: 'svg', x: Math.round(W * 0.1), y: Math.round((H - icoS) / 2), w: icoS, h: icoS, svg: iconSvg(keyOf(card.subtitle), theme.accent) });

    // Columna derecha (alineada a la derecha), bloque centrado verticalmente.
    const cx = Math.round(W * 0.45), cw = W - cx - pad;
    const kH = card.date ? Math.round(H * 0.1) : 0;
    const tH = Math.round(H * 0.34);
    const cH = card.subtitle ? Math.round(H * 0.11) : 0;
    const bH = card.body ? Math.round(H * 0.06) : 0;
    const g = Math.round(H * 0.005);
    const total = kH + tH + cH + bH + g * 3;
    let y = Math.round((H - total) / 2);
    if (card.date) { els.push({ type: 'text', x: cx, y, w: cw, h: kH, text: card.date.toUpperCase(), font: 'display', weight: 800, color: theme.text, align: 'right', valign: 'bottom', autofit: { min: Math.round(H * 0.05), max: Math.round(H * 0.1), lines: 1 } }); y += kH + g; }
    els.push({ type: 'text', x: cx, y, w: cw, h: tH, text: (card.title || '').toUpperCase(), font: 'display', weight: 800, color: theme.text, align: 'right', valign: 'center', autofit: { min: Math.round(H * 0.16), max: Math.round(H * 0.34), lines: 1 } }); y += tH + g;
    if (card.subtitle) { els.push({ type: 'text', x: cx, y, w: cw, h: cH, text: card.subtitle.toUpperCase(), font: 'display', weight: 800, color: theme.text, align: 'right', valign: 'top', autofit: { min: Math.round(H * 0.05), max: Math.round(H * 0.11), lines: 1 } }); y += cH + g; }
    if (card.body) { els.push({ type: 'text', x: cx, y, w: cw, h: bH, text: card.body, font: 'text', weight: 700, color: theme.textMuted, align: 'right', valign: 'top', size: Math.round(H * 0.048) }); }

    return { background: { type: 'solid', color: theme.bg }, elements: els };
  },
};
