'use strict';
// AGENDA — cabecera roja, bloque horario grande, evento en negro y banda
// inferior de marca. Diseñada para que una pieza de agenda salga lista sin
// pasar por el editor visual.
module.exports = {
  id: 'agenda',
  label: 'Agenda / Lista del día',
  hint: { title: 'Etiqueta de la banda (p. ej. AGENDA)', subtitle: 'Periodo visible', body: 'Una línea por evento: FECHA | HORA | Nombre | Detalle', date: '—' },
  defaultTheme: 'blanco',
  logo: false, // dibuja su propia marca en la banda inferior
  build(card, ctx) {
    const { W, H } = ctx;
    const pad = Math.round(W * 0.052);
    const red = '#FF2D2D';
    const white = '#FFFFFF';
    const paper = '#F2F1ED';
    const dark = '#0E0E0E';
    const rowText = '#0E0E0E';
    const topH = Math.round(H * 0.145);
    const botH = Math.round(H * 0.13);
    const els = [];
    const cleanTitle = String(card.title || '').trim();
    const title = (!cleanTitle || cleanTitle.length < 3) ? 'AGENDA' : cleanTitle;
    const subtitle = String(card.subtitle || '').trim();
    const brand = ctx.brand || {};
    const wordmark = brand.wordmark || {};
    const brandText = (wordmark.a || wordmark.b)
      ? `${wordmark.a || ''}${wordmark.b || ''}.com`
      : (brand.website || brand.name || 'GasteizBerri.com');
    const headTextY = Math.round(topH * 0.11);
    const headTextH = Math.round(topH * 0.78);

    // Banda superior + etiqueta + caja flecha.
    els.push({ type: 'rect', x: 0, y: 0, w: W - topH, h: topH, color: red });
    els.push({ type: 'rect', x: W - topH, y: 0, w: topH, h: topH, color: dark });
    els.push({
      type: 'text', x: pad, y: headTextY, w: Math.round(W * (subtitle ? 0.38 : 0.6)), h: headTextH,
      text: title.toUpperCase(), font: 'display', weight: 800, color: white,
      align: 'left', valign: 'center', size: Math.round(topH * 0.72),
      lineHeight: 0.9, letterSpacingEm: 0.01,
    });
    if (subtitle) {
      els.push({
        type: 'text', x: Math.round(W * 0.49), y: headTextY, w: Math.round(W * 0.37), h: headTextH,
        text: subtitle.toUpperCase(), font: 'display', weight: 800, color: white,
        align: 'center', valign: 'center', lineHeight: 0.9, letterSpacingEm: 0.01,
        autofit: { min: Math.round(topH * 0.34), max: Math.round(topH * 0.72), lines: 1 },
      });
    }
    const a = topH * 0.3, m = topH / 2, swA = topH * 0.08;
    els.push({ type: 'svg', x: W - topH, y: 0, w: topH, h: topH, svg: `<svg viewBox="0 0 ${topH} ${topH}" width="100%" height="100%"><line x1="${m - a}" y1="${m + a}" x2="${m + a}" y2="${m - a}" stroke="${red}" stroke-width="${swA}" stroke-linecap="round"/><polyline points="${m + a * 0.1},${m - a} ${m + a},${m - a} ${m + a},${m + a * 0.1}" fill="none" stroke="${red}" stroke-width="${swA}" stroke-linecap="round" stroke-linejoin="round"/></svg>` });

    // Filas.
    const items = String(card.body || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean).slice(0, 3)
      .map((l) => {
        const p = l.split('|').map((x) => x.trim());
        const dated = /^\d{4}-\d{2}-\d{2}$/.test(p[0] || '');
        if (dated) {
          let day = p[0];
          try {
            day = new Date(`${p[0]}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' }).replace('.', '').toUpperCase();
          } catch {}
          return {
            time: [day, p[1]].filter(Boolean).join(' · '),
            name: (p[2] || '').toUpperCase(),
            venue: p.slice(3).filter(Boolean).join(' · ').toUpperCase(),
          };
        }
        if (p.length > 1) return {
          time: p[0] || '',
          name: (p[1] || p[0] || '').toUpperCase(),
          venue: (p.length >= 4 ? [p[2], p[3]].filter(Boolean).join(' · ') : (p[2] || '')).toUpperCase(),
        };
        const m = l.match(/^(\d{1,2}[:.]\d{2})\s+(.+)$/);
        if (m) return { time: m[1].replace('.', ':'), name: m[2].toUpperCase(), venue: '' };
        return { time: '', name: l.toUpperCase(), venue: '' };
      });
    const n = Math.max(1, items.length);
    const top = topH + Math.round(n === 1 ? H * 0.04 : H * 0.07);
    const bottom = H - botH - Math.round(n === 1 ? H * 0.13 : H * 0.05);
    const rowH = (bottom - top) / n;
    items.forEach((it, i) => {
      const rowTop = top + i * rowH, cyy = rowTop + rowH / 2;
      const boxW = Math.round(W * (n === 1 ? 0.24 : 0.2));
      const boxH = Math.round(Math.min(rowH * (n === 1 ? 0.72 : 0.66), H * (n === 1 ? 0.32 : 0.22)));
      if (i > 0) els.push({ type: 'rect', x: pad, y: Math.round(rowTop), w: W - pad * 2, h: 2, color: 'rgba(14,14,14,0.18)' });
      const hasTime = Boolean(it.time);
      const nameX = hasTime ? pad + boxW + Math.round(W * 0.018) : pad;
      const nameW = W - nameX - pad;
      if (it.time) {
        const by = Math.round(cyy - boxH / 2);
        els.push({ type: 'rect', x: pad, y: by, w: boxW, h: boxH, color: red });
        els.push({ type: 'text', x: pad, y: by, w: boxW, h: boxH, text: it.time, font: 'display', weight: 800, color: white, align: 'center', valign: 'center', autofit: { min: Math.round(H * 0.06), max: Math.round(boxH * 0.62), lines: 1 } });
      }
      const hasV = Boolean(it.venue);
      els.push({ type: 'text', x: nameX, y: Math.round(cyy - rowH * (hasV ? 0.25 : 0.18)), w: nameW, h: Math.round(rowH * (hasV ? 0.26 : 0.36)), text: it.name, font: 'display', weight: 800, color: rowText, align: hasTime ? 'left' : 'center', valign: hasV ? 'bottom' : 'center', autofit: { min: Math.round(H * 0.04), max: Math.round(rowH * (n === 1 ? 0.2 : 0.26)), lines: hasTime ? 1 : 2 } });
      if (hasV) els.push({ type: 'text', x: nameX, y: Math.round(cyy + rowH * 0.04), w: nameW, h: Math.round(rowH * 0.22), text: it.venue, font: 'display', weight: 800, color: rowText, align: 'left', valign: 'center', autofit: { min: Math.round(H * 0.04), max: Math.round(rowH * (n === 1 ? 0.18 : 0.22)), lines: 1 } });
    });

    // Banda inferior: marca textual + chevrons.
    els.push({ type: 'rect', x: 0, y: H - botH, w: W, h: botH, color: dark });
    els.push({ type: 'logo', x: pad, y: Math.round(H - botH + botH * 0.18), w: Math.round(W * 0.43), h: Math.round(botH * 0.66), text: brandText, color: white, font: 'text', weight: 900, size: Math.round(botH * 0.62) });
    const cs = Math.round(botH * 0.22), chx = W - pad - Math.round(W * 0.02), chy = H - botH / 2;
    let chev = '';
    [0, 1].forEach((k) => { const x = chx - k * cs * 1.1; chev += `<polyline points="${x - cs},${chy - cs} ${x},${chy} ${x - cs},${chy + cs}" fill="none" stroke="${red}" stroke-width="${Math.round(cs * 0.4)}" stroke-linecap="round" stroke-linejoin="round"/>`; });
    const chevX = Math.round(chx - cs * 2.4), chevY = Math.round(chy - cs * 1.5);
    const chevW = Math.round(cs * 3.0), chevH = Math.round(cs * 3.0);
    els.push({ type: 'svg', decorative: true, x: chevX, y: chevY, w: chevW, h: chevH, svg: `<svg viewBox="${chevX} ${chevY} ${chevW} ${chevH}" width="100%" height="100%">${chev}</svg>` });

    return { background: { type: 'solid', color: paper }, elements: els };
  },
};
