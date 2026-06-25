'use strict';
// CLIMA — temperatura GIGANTE + icono del tiempo (dibujado en SVG) + condición.
// El icono se deduce de la condición escrita en el subtítulo (soleado, lluvia…).

function keyOf(text) {
  const t = String(text || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  if (/torment|rayo/.test(t)) return 'tormenta';
  if (/niev|nevad/.test(t)) return 'nieve';
  if (/lluv|chubas|aguac/.test(t)) return 'lluvia';
  if (/niebl|brum|calima/.test(t)) return 'niebla';
  if (/vient|rach/.test(t)) return 'viento';
  if (/cubiert|nubl|nubos/.test(t)) return 'nube';
  if (/sol|despej|raso/.test(t)) return 'sol';
  return 'sol';
}

// Iconos monocromos de línea (estilo del Display System), en un único color `c`.
function cloud(cx, cy, s, c, sw) {
  return `<path d="M ${cx - s * 0.55} ${cy + s * 0.3}
    a ${s * 0.3} ${s * 0.3} 0 0 1 ${s * 0.02} ${-s * 0.58}
    a ${s * 0.34} ${s * 0.34} 0 0 1 ${s * 0.62} ${-s * 0.04}
    a ${s * 0.26} ${s * 0.26} 0 0 1 ${s * 0.5} ${s * 0.18}
    a ${s * 0.24} ${s * 0.24} 0 0 1 ${-s * 0.12} ${s * 0.46} Z"
    fill="none" stroke="${c}" stroke-width="${sw}" stroke-linejoin="round"/>`;
}

function icon(key, cx, cy, s, c) {
  const sw = Math.round(s * 0.11);
  switch (key) {
    case 'sol': {
      let rays = '';
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        rays += `<line x1="${cx + Math.cos(a) * s * 0.62}" y1="${cy + Math.sin(a) * s * 0.62}" x2="${cx + Math.cos(a) * s * 0.92}" y2="${cy + Math.sin(a) * s * 0.92}" stroke="${c}" stroke-width="${sw}" stroke-linecap="round"/>`;
      }
      return `<circle cx="${cx}" cy="${cy}" r="${s * 0.42}" fill="none" stroke="${c}" stroke-width="${sw}"/>${rays}`;
    }
    case 'nube':
      return cloud(cx, cy, s, c, sw);
    case 'lluvia': {
      let d = '';
      for (let i = -1; i <= 1; i++) d += `<line x1="${cx + i * s * 0.26}" y1="${cy + s * 0.45}" x2="${cx + i * s * 0.26 - s * 0.08}" y2="${cy + s * 0.74}" stroke="${c}" stroke-width="${sw}" stroke-linecap="round"/>`;
      return `${cloud(cx, cy - s * 0.05, s, c, sw)}${d}`;
    }
    case 'nieve': {
      let f = '';
      for (let i = -1; i <= 1; i++) f += `<circle cx="${cx + i * s * 0.26}" cy="${cy + s * 0.58}" r="${s * 0.06}" fill="${c}"/>`;
      return `${cloud(cx, cy - s * 0.05, s, c, sw)}${f}`;
    }
    case 'tormenta':
      return `${cloud(cx, cy - s * 0.05, s, c, sw)}<polygon points="${cx},${cy + s * 0.4} ${cx + s * 0.22},${cy + s * 0.4} ${cx + s * 0.05},${cy + s * 0.66} ${cx + s * 0.2},${cy + s * 0.66} ${cx - s * 0.12},${cy + s} ${cx - s * 0.02},${cy + s * 0.6} ${cx - s * 0.16},${cy + s * 0.6}" fill="${c}"/>`;
    case 'niebla': {
      let l = '';
      for (let i = 0; i < 4; i++) l += `<rect x="${cx - s * 0.6 + (i % 2) * s * 0.15}" y="${cy - s * 0.3 + i * s * 0.22}" width="${s * (1.2 - (i % 2) * 0.35)}" height="${sw}" rx="${sw / 2}" fill="${c}"/>`;
      return l;
    }
    case 'viento': {
      let g = '';
      const ys = [-0.25, 0.05, 0.35];
      ys.forEach((yy, i) => {
        const w = s * (0.95 - i * 0.12);
        g += `<path d="M ${cx - s * 0.6} ${cy + s * yy} h ${w} a ${s * 0.16} ${s * 0.16} 0 1 0 ${-s * 0.12} ${s * 0.16}" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round"/>`;
      });
      return g;
    }
    default:
      return icon('sol', cx, cy, s, c);
  }
}

module.exports = {
  id: 'clima',
  label: 'Clima / Tiempo (temperatura + icono)',
  hint: { title: 'Temperatura (p. ej. 24ºC)', subtitle: 'Condición: SOLEADO, LLUVIA…', body: 'Máx/Mín (opcional)', date: 'Cuándo: HOY, MAÑANA…' },
  logoPos: 'bl',
  defaultTheme: 'azul',
  frame(card, ctx) {
    const { W, H, font, fontDisplay, lib, theme } = ctx;
    const pad = Math.round(W * 0.05);
    const key = keyOf(card.subtitle);

    // Icono a la izquierda, en el color de acento del tema.
    const icoCx = Math.round(W * 0.27);
    const icoCy = Math.round(H * 0.46);
    const icoS = Math.round(H * 0.28);

    // Columna derecha, alineada a la derecha: HOY / 24ºC / SOLEADO.
    const rightX = W - pad;
    const colW = Math.round(W * 0.46);

    const kicker = card.date
      ? lib.fitText(card.date.toUpperCase(), { maxWidth: colW, maxLines: 1, maxSize: Math.round(H * 0.1), minSize: Math.round(H * 0.05), weight: 800 })
      : null;
    const temp = lib.fitText((card.title || '').toUpperCase(), { maxWidth: colW, maxLines: 1, maxSize: Math.round(H * 0.34), minSize: Math.round(H * 0.16), weight: 800 });
    const cond = card.subtitle
      ? lib.fitText(card.subtitle.toUpperCase(), { maxWidth: colW, maxLines: 1, maxSize: Math.round(H * 0.11), minSize: Math.round(H * 0.05), weight: 800 })
      : null;
    const body = card.body
      ? lib.fitText(card.body, { maxWidth: colW, maxLines: 1, maxSize: Math.round(H * 0.045), minSize: Math.round(H * 0.03), weight: 600 })
      : null;

    const gap = Math.round(H * 0.012);
    const blockH = (kicker ? kicker.size + gap : 0) + temp.size + (cond ? gap + cond.size : 0) + (body ? gap + body.size : 0);
    let y = (H - blockH) / 2;

    let out = '';
    if (kicker) { y += kicker.size; out += lib.textBlock([kicker.lines[0]], { x: rightX, y, size: kicker.size, font: fontDisplay, weight: 800, fill: theme.text, anchor: 'end' }); y += gap; }
    y += temp.size; out += lib.textBlock([temp.lines[0] || ''], { x: rightX, y, size: temp.size, font: fontDisplay, weight: 800, fill: theme.text, anchor: 'end' });
    if (cond) { y += gap + cond.size; out += lib.textBlock([cond.lines[0]], { x: rightX, y, size: cond.size, font: fontDisplay, weight: 800, fill: theme.text, anchor: 'end' }); }
    if (body) { y += gap + body.size; out += lib.textBlock([body.lines[0]], { x: rightX, y, size: body.size, font, weight: 600, fill: theme.textMuted, anchor: 'end' }); }

    const svg =
      `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${W}" height="${H}" fill="${theme.bg}"/>
        ${icon(key, icoCx, icoCy, icoS, theme.accent)}
        ${out}
      </svg>`;

    return { base: { solid: theme.bg }, svg };
  },
};
