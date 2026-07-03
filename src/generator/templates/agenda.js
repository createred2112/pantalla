'use strict';
// AGENDA — banda superior (lima) + filas (hora en caja + nombre + lugar) +
// banda inferior (carbón) con marca y chevrons. Motor HTML.
module.exports = {
  id: 'agenda',
  label: 'Agenda / Lista del día',
  hint: { title: 'Etiqueta de la banda (p. ej. AGENDA)', subtitle: '—', body: 'Una línea por evento: HORA | Nombre | Lugar', date: '—' },
  defaultTheme: 'blanco',
  logo: false, // dibuja su propia marca en la banda inferior
  build(card, ctx) {
    const { W, H, theme } = ctx;
    const pad = Math.round(W * 0.03);
    // Colores del TEMA (antes iban fijos y el texto desaparecía en fondos oscuros).
    const acc = theme.accent || '#D6FF00';
    const accText = theme.accentText || '#0E0E0E';
    const dark = '#0E0E0E'; // banda inferior: siempre oscura (logo claro encima)
    const rowText = theme.text; // filas: color de texto del tema (contrasta con el fondo)
    const topH = Math.round(H * 0.14), botH = Math.round(H * 0.13);
    const els = [];
    const cleanTitle = String(card.title || '').trim();
    const title = (!cleanTitle || cleanTitle.length < 3) ? 'AGENDA' : cleanTitle;

    // Banda superior + etiqueta + caja flecha.
    els.push({ type: 'rect', x: 0, y: 0, w: W, h: topH, color: acc });
    els.push({ type: 'text', x: pad, y: 0, w: Math.round(W * 0.6), h: topH, text: title.toUpperCase(), font: 'display', weight: 800, color: accText, align: 'left', valign: 'center', size: Math.round(topH * 0.42), letterSpacingEm: 0.03 });
    els.push({ type: 'rect', x: W - topH, y: 0, w: topH, h: topH, color: dark });
    const a = topH * 0.3, m = topH / 2, swA = topH * 0.08;
    els.push({ type: 'svg', x: W - topH, y: 0, w: topH, h: topH, svg: `<svg viewBox="0 0 ${topH} ${topH}" width="100%" height="100%"><line x1="${m - a}" y1="${m + a}" x2="${m + a}" y2="${m - a}" stroke="${acc}" stroke-width="${swA}" stroke-linecap="round"/><polyline points="${m + a * 0.1},${m - a} ${m + a},${m - a} ${m + a},${m + a * 0.1}" fill="none" stroke="${acc}" stroke-width="${swA}" stroke-linecap="round" stroke-linejoin="round"/></svg>` });

    // Filas.
    const items = String(card.body || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean).slice(0, 3)
      .map((l) => {
        const p = l.split('|').map((x) => x.trim());
        if (p.length > 1) return { time: p[0] || '', name: (p[1] || p[0] || '').toUpperCase(), venue: (p[2] || '').toUpperCase() };
        const m = l.match(/^(\d{1,2}[:.]\d{2})\s+(.+)$/);
        if (m) return { time: m[1].replace('.', ':'), name: m[2].toUpperCase(), venue: '' };
        return { time: '', name: l.toUpperCase(), venue: '' };
      });
    const n = Math.max(1, items.length);
    const top = topH + Math.round(H * 0.03), bottom = H - botH - Math.round(H * 0.02);
    const rowH = (bottom - top) / n;
    const boxW = Math.round(W * 0.26), boxH = Math.round(rowH * 0.62);
    items.forEach((it, i) => {
      const rowTop = top + i * rowH, cyy = rowTop + rowH / 2;
      if (i > 0) els.push({ type: 'rect', x: pad, y: Math.round(rowTop), w: W - pad * 2, h: 2, color: theme.textMuted });
      const hasTime = Boolean(it.time);
      const nameX = hasTime ? pad + boxW + Math.round(W * 0.025) : pad;
      const nameW = W - nameX - pad;
      if (it.time) {
        const by = Math.round(cyy - boxH / 2);
        els.push({ type: 'rect', x: pad, y: by, w: boxW, h: boxH, color: acc });
        els.push({ type: 'text', x: pad, y: by, w: boxW, h: boxH, text: it.time, font: 'display', weight: 800, color: accText, align: 'center', valign: 'center', autofit: { min: Math.round(H * 0.05), max: Math.round(boxH * 0.7), lines: 1 } });
      }
      const hasV = Boolean(it.venue);
      els.push({ type: 'text', x: nameX, y: Math.round(cyy - rowH * 0.28), w: nameW, h: Math.round(rowH * 0.42), text: it.name, font: 'display', weight: 800, color: rowText, align: hasTime ? 'left' : 'center', valign: hasV ? 'bottom' : 'center', autofit: { min: Math.round(H * 0.035), max: Math.round(rowH * 0.42), lines: hasTime ? 1 : 2 } });
      if (hasV) els.push({ type: 'text', x: nameX, y: Math.round(cyy + rowH * 0.1), w: nameW, h: Math.round(rowH * 0.2), text: it.venue, font: 'text', weight: 700, color: rowText, align: 'left', valign: 'center', size: Math.round(rowH * 0.16) });
    });

    // Banda inferior: logo real + chevrons. Si no hay logo, no se inventa marca.
    els.push({ type: 'rect', x: 0, y: H - botH, w: W, h: botH, color: dark });
    if (ctx.logo && ctx.logo.light) {
      const lh = Math.round(botH * 0.64);
      els.push({ type: 'svg', x: pad, y: Math.round(H - botH + (botH - lh) / 2), w: Math.round(W * 0.32), h: lh, svg: `<img src="${ctx.logo.light}" style="height:${lh}px;width:auto;display:block"/>` });
    }
    const cs = Math.round(botH * 0.22), chx = W - pad - Math.round(W * 0.02), chy = H - botH / 2;
    let chev = '';
    [0, 1].forEach((k) => { const x = chx - k * cs * 1.1; chev += `<polyline points="${x - cs},${chy - cs} ${x},${chy} ${x - cs},${chy + cs}" fill="none" stroke="${acc}" stroke-width="${Math.round(cs * 0.4)}" stroke-linecap="round" stroke-linejoin="round"/>`; });
    const chevX = Math.round(chx - cs * 2.4), chevY = Math.round(chy - cs * 1.5);
    const chevW = Math.round(cs * 3.0), chevH = Math.round(cs * 3.0);
    els.push({ type: 'svg', decorative: true, x: chevX, y: chevY, w: chevW, h: chevH, svg: `<svg viewBox="${chevX} ${chevY} ${chevW} ${chevH}" width="100%" height="100%">${chev}</svg>` });

    return { background: { type: 'solid', color: theme.bg }, elements: els };
  },
};
