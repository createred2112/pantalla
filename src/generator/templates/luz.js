'use strict';
// LUZ — precio actual gigante + CURVA horaria del día (barras) con la hora más
// barata en acento y la hora actual marcada. Requiere card.data.series
// (la rellena el worker powerPrice); sin datos, cae a la plantilla "dato".
function two(n) { return String(n).padStart(2, '0'); }
function fmt(v) { return String(v).replace('.', ','); }

function chartSvg(series, d, ctx, cw, ch) {
  const { theme } = ctx;
  const fam = ctx.font || 'sans-serif';
  const n = series.length;
  const labelZone = Math.round(ch * 0.16);       // etiquetas de horas abajo
  const capZone = Math.round(ch * 0.14);         // etiqueta de valor arriba
  const plotH = ch - labelZone - capZone;
  const slot = cw / n;
  const bw = Math.max(6, Math.round(slot * 0.62));
  const max = Math.max(...series.map((s) => s.v)) || 1;
  const nowH = d.now ? d.now.h : -1;
  const cheapH = d.cheap ? d.cheap.h : -1;
  let bars = '', labels = '', caps = '';
  series.forEach((s, i) => {
    const h = Math.max(4, Math.round((s.v / max) * plotH));
    const x = Math.round(i * slot + (slot - bw) / 2);
    const y = capZone + (plotH - h);
    const isCheap = s.h === cheapH;
    const isNow = s.h === nowH;
    const fill = isCheap ? theme.accent : theme.text;
    const op = isCheap ? 1 : (isNow ? 0.92 : 0.26);
    bars += `<rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="${Math.min(6, bw / 3)}" fill="${fill}" fill-opacity="${op}"/>`;
    if (isCheap) {
      caps += `<text x="${x + bw / 2}" y="${Math.max(capZone * 0.75, y - capZone * 0.28)}" text-anchor="middle" font-family="${fam}" font-weight="800" font-size="${Math.round(capZone * 0.72)}" fill="${theme.accent}">${fmt(s.v)}</text>`;
    }
    if (isNow && !isCheap) {
      caps += `<text x="${x + bw / 2}" y="${Math.max(capZone * 0.75, y - capZone * 0.28)}" text-anchor="middle" font-family="${fam}" font-weight="800" font-size="${Math.round(capZone * 0.6)}" fill="${theme.text}" fill-opacity="0.85">AHORA</text>`;
    }
    if (s.h % 6 === 0 || isCheap) {
      labels += `<text x="${x + bw / 2}" y="${ch - Math.round(labelZone * 0.18)}" text-anchor="middle" font-family="${fam}" font-weight="${isCheap ? 800 : 600}" font-size="${Math.round(labelZone * 0.58)}" fill="${isCheap ? theme.accent : theme.textMuted}">${two(s.h)}h</text>`;
    }
  });
  return `<svg viewBox="0 0 ${cw} ${ch}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">${bars}${caps}${labels}</svg>`;
}

module.exports = {
  id: 'luz',
  label: 'Luz (precio + curva del día)',
  hint: { title: 'Precio ahora (lo rellena el worker)', subtitle: 'Etiqueta (chip)', body: '—', date: 'Fuente' },
  defaultTheme: 'carbon',
  logoPos: 'bl',
  build(card, ctx) {
    const { W, H, theme } = ctx;
    const d = card.data || {};
    const series = Array.isArray(d.series) && d.series.length ? d.series : null;
    if (!series) return require('./dato').build(card, ctx);
    const pad = Math.round(W * 0.05);
    const els = [];

    els.push({ type: 'chip', x: pad, y: Math.round(H * 0.065), size: Math.round(H * 0.04), bg: theme.accent, color: theme.accentText, text: card.subtitle || 'PRECIO DE LA LUZ', letterSpacing: 2 });

    // Precio actual, protagonista.
    els.push({
      type: 'text', x: pad, y: Math.round(H * 0.15), w: Math.round(W * 0.55), h: Math.round(H * 0.21),
      text: (card.title || '').toUpperCase(), font: 'display', weight: 800, color: theme.text,
      align: 'left', valign: 'center', lineHeight: 1,
      autofit: { min: Math.round(H * 0.1), max: Math.round(H * 0.19), lines: 1 },
    });
    if (card.date) {
      els.push({ type: 'text', x: Math.round(W * 0.6), y: Math.round(H * 0.15), w: Math.round(W * 0.4) - pad, h: Math.round(H * 0.21), text: card.date.toUpperCase(), font: 'text', weight: 700, color: theme.textMuted, align: 'right', valign: 'center', size: Math.round(H * 0.034) });
    }

    // La curva del día.
    const cw = W - pad * 2, ch = Math.round(H * 0.42);
    els.push({ type: 'svg', x: pad, y: Math.round(H * 0.39), w: cw, h: ch, svg: chartSvg(series, d, ctx, cw, ch) });

    // Lectura clave, abajo a la derecha (el logo vive abajo-izquierda).
    if (d.cheap) {
      els.push({
        type: 'text', x: Math.round(W * 0.35), y: Math.round(H * 0.855), w: Math.round(W * 0.65) - pad, h: Math.round(H * 0.08),
        text: `LA MÁS BARATA: ${two(d.cheap.h)}:00 · ${fmt(d.cheap.v)} CTS`,
        font: 'text', weight: 900, color: theme.accent, align: 'right', valign: 'center', size: Math.round(H * 0.045),
      });
    }
    return { background: { type: 'solid', color: theme.bg }, elements: els };
  },
};
