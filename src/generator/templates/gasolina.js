'use strict';
// GASOLINA — las 3 estaciones más baratas de la ciudad, precio gigante y la
// ganadora en acento. Requiere card.data.stations (worker fuel); sin datos,
// cae a la plantilla "dato".
module.exports = {
  id: 'gasolina',
  label: 'Gasolina (más baratas hoy)',
  hint: { title: 'Precio más barato (lo rellena el worker)', subtitle: 'Etiqueta (chip)', body: '—', date: 'Fuente' },
  defaultTheme: 'carbon',
  dynamicLayoutText: true,
  logoPos: 'bl',
  build(card, ctx) {
    const { W, H, theme } = ctx;
    const d = card.data || {};
    const stations = Array.isArray(d.stations) && d.stations.length ? d.stations.slice(0, 2) : null;
    if (!stations) return require('./dato').build(card, ctx);
    const pad = Math.round(W * 0.05);
    const els = [];
    const f = (v) => (typeof v === 'number' ? v.toFixed(3).replace('.', ',') : String(v || ''));
    const shortAddr = (v) => String(v || '')
      .replace(/\s+/g, ' ')
      .replace(/\b(POLIGONO|POLÍGONO|AVENIDA|CALLE|CARRETERA)\b/gi, (m) => ({ POLIGONO: 'POL.', 'POLÍGONO': 'POL.', AVENIDA: 'AV.', CALLE: 'C/', CARRETERA: 'CTRA.' }[m.toUpperCase()] || m))
      .slice(0, 54);

    els.push({ type: 'chip', x: pad, y: Math.round(H * 0.065), size: Math.round(H * 0.04), bg: theme.accent, color: theme.accentText, text: card.subtitle || 'GASOLINA 95 · HOY', letterSpacing: 2 });
    if (card.date) {
      els.push({ type: 'text', x: Math.round(W * 0.56), y: Math.round(H * 0.065), w: Math.round(W * 0.44) - pad, h: Math.round(H * 0.08), text: card.date.toUpperCase(), font: 'text', weight: 800, color: theme.textMuted, align: 'right', valign: 'center', size: Math.round(H * 0.033) });
    }

    // Dos filas máximo: si metemos tres, en la pantalla real no se leen.
    const top = Math.round(H * 0.18);
    const bottom = Math.round(H * 0.79);
    const rowH = (bottom - top) / 2;
    const priceW = Math.round(W * 0.36);
    const nameX = pad + priceW + Math.round(W * 0.04);
    const nameW = W - nameX - pad;
    stations.forEach((s, i) => {
      const y = Math.round(top + i * rowH);
      const first = i === 0;
      const color = first ? theme.accent : theme.text;
      if (i > 0) els.push({ type: 'rect', x: pad, y, w: W - pad * 2, h: 2, color: theme.textMuted, radius: 0 });
      els.push({
        type: 'text', x: pad, y: y + Math.round(rowH * 0.08), w: priceW, h: Math.round(rowH * 0.84),
        text: `${f(s.g95)}€`, font: 'display', weight: 800, color,
        align: 'left', valign: 'center', lineHeight: 1,
        autofit: { min: Math.round(H * 0.12), max: Math.round(rowH * 0.66), lines: 1 },
      });
      els.push({
        type: 'text', x: nameX, y: y + Math.round(rowH * 0.14), w: nameW, h: Math.round(rowH * 0.36),
        text: String(s.name || '').toUpperCase(), font: 'display', weight: 800, color,
        align: 'left', valign: 'bottom', lineHeight: 1,
        autofit: { min: Math.round(H * 0.05), max: Math.round(rowH * 0.28), lines: 1 },
      });
      els.push({
        type: 'text', x: nameX, y: y + Math.round(rowH * 0.56), w: nameW, h: Math.round(rowH * 0.28),
        text: shortAddr(s.addr).toUpperCase(),
        font: 'text', weight: 800, color: theme.textMuted, align: 'left', valign: 'top', lineHeight: 1.05,
        autofit: { min: Math.round(H * 0.032), max: Math.round(rowH * 0.16), lines: 2 },
      });
    });

    return { background: { type: 'solid', color: theme.bg }, elements: els };
  },
};
