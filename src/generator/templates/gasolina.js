'use strict';
// GASOLINA — las 3 estaciones más baratas de la ciudad, precio gigante y la
// ganadora en acento. Requiere card.data.stations (worker fuel); sin datos,
// cae a la plantilla "dato".
module.exports = {
  id: 'gasolina',
  label: 'Gasolina (más baratas hoy)',
  hint: { title: 'Precio más barato (lo rellena el worker)', subtitle: 'Etiqueta (chip)', body: '—', date: 'Fuente' },
  defaultTheme: 'carbon',
  logoPos: 'bl',
  build(card, ctx) {
    const { W, H, theme } = ctx;
    const d = card.data || {};
    const stations = Array.isArray(d.stations) && d.stations.length ? d.stations.slice(0, 3) : null;
    if (!stations) return require('./dato').build(card, ctx);
    const pad = Math.round(W * 0.05);
    const els = [];
    const f = (v) => (typeof v === 'number' ? v.toFixed(3).replace('.', ',') : String(v || ''));

    els.push({ type: 'chip', x: pad, y: Math.round(H * 0.065), size: Math.round(H * 0.04), bg: theme.accent, color: theme.accentText, text: card.subtitle || 'GASOLINA 95 · HOY', letterSpacing: 2 });
    if (card.date) {
      els.push({ type: 'text', x: Math.round(W * 0.5), y: Math.round(H * 0.065), w: Math.round(W * 0.5) - pad, h: Math.round(H * 0.08), text: card.date.toUpperCase(), font: 'text', weight: 700, color: theme.textMuted, align: 'right', valign: 'center', size: Math.round(H * 0.03) });
    }

    // Tres filas: precio enorme + estación. La más barata, en acento.
    const top = Math.round(H * 0.19);
    const bottom = Math.round(H * 0.8);
    const rowH = (bottom - top) / 3;
    const priceW = Math.round(W * 0.34);
    const nameX = pad + priceW + Math.round(W * 0.03);
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
        autofit: { min: Math.round(H * 0.07), max: Math.round(rowH * (first ? 0.72 : 0.58)), lines: 1 },
      });
      els.push({
        type: 'text', x: nameX, y: y + Math.round(rowH * 0.14), w: nameW, h: Math.round(rowH * 0.42),
        text: String(s.name || '').toUpperCase(), font: 'display', weight: 800, color,
        align: 'left', valign: 'bottom', lineHeight: 1,
        autofit: { min: Math.round(H * 0.035), max: Math.round(rowH * 0.34), lines: 1 },
      });
      els.push({
        type: 'text', x: nameX, y: y + Math.round(rowH * 0.6), w: nameW, h: Math.round(rowH * 0.28),
        text: `${s.addr || ''}${s.goa ? `  ·  DIÉSEL ${f(s.goa)}€` : ''}`,
        font: 'text', weight: 600, color: theme.textMuted, align: 'left', valign: 'top', size: Math.round(rowH * 0.17),
      });
    });

    return { background: { type: 'solid', color: theme.bg }, elements: els };
  },
};
