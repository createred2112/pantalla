'use strict';
// AGENDA v2 — misma estructura de bandas, pero cajas de hora más grandes,
// nombres más altos y separadores más gruesos. Máximo 3 filas.
const K = require('./_kit');
const v1 = require('../agenda');

module.exports = {
  ...v1,
  build(card, ctx) {
    const { W, H, theme } = ctx;
    const pad = K.r(W * 0.052);
    const red = theme.accent;
    const white = theme.accentText;
    const paper = theme.bg;
    const dark = theme.text;
    const topH = K.r(H * 0.16);
    const botH = K.r(H * 0.135);
    const els = [];
    const cleanTitle = String(card.title || '').trim();
    const titleTxt = (!cleanTitle || cleanTitle.length < 3) ? 'AGENDA' : cleanTitle;
    const subtitle = String(card.subtitle || '').trim();
    const brand = ctx.brand || {};
    const wordmark = brand.wordmark || {};
    const brandText = (wordmark.a || wordmark.b)
      ? `${wordmark.a || ''}${wordmark.b || ''}.com`
      : (brand.website || brand.name || 'GasteizBerri.com');

    // Banda superior + etiqueta + caja flecha.
    els.push({ type: 'rect', x: 0, y: 0, w: W - topH, h: topH, color: red });
    els.push({ type: 'rect', x: W - topH, y: 0, w: topH, h: topH, color: dark });
    els.push({
      type: 'text', x: pad, y: K.r(topH * 0.1), w: K.r(W * (subtitle ? 0.38 : 0.62)), h: K.r(topH * 0.8),
      text: titleTxt.toUpperCase(), font: 'display', weight: 800, color: white,
      align: 'left', valign: 'center', lineHeight: 0.9, letterSpacingEm: 0.01,
      autofit: { min: K.r(topH * 0.4), max: K.r(topH * 0.76), lines: 1 },
    });
    if (subtitle) {
      els.push({
        type: 'text', x: K.r(W * 0.49), y: K.r(topH * 0.1), w: K.r(W * 0.37), h: K.r(topH * 0.8),
        text: subtitle.toUpperCase(), font: 'display', weight: 800, color: white,
        align: 'center', valign: 'center', lineHeight: 0.9, letterSpacingEm: 0.01,
        autofit: { min: K.r(topH * 0.4), max: K.r(topH * 0.76), lines: 1 },
      });
    }
    const a = topH * 0.3, m = topH / 2, swA = topH * 0.09;
    els.push({ type: 'svg', x: W - topH, y: 0, w: topH, h: topH, svg: `<svg viewBox="0 0 ${topH} ${topH}" width="100%" height="100%"><line x1="${m - a}" y1="${m + a}" x2="${m + a}" y2="${m - a}" stroke="${red}" stroke-width="${swA}" stroke-linecap="round"/><polyline points="${m + a * 0.1},${m - a} ${m + a},${m - a} ${m + a},${m + a * 0.1}" fill="none" stroke="${red}" stroke-width="${swA}" stroke-linecap="round" stroke-linejoin="round"/></svg>` });

    // Filas (máx 3), tipografía claramente mayor que v1.
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
        const mm = l.match(/^(\d{1,2}[:.]\d{2})\s+(.+)$/);
        if (mm) return { time: mm[1].replace('.', ':'), name: mm[2].toUpperCase(), venue: '' };
        return { time: '', name: l.toUpperCase(), venue: '' };
      });
    const n = Math.max(1, items.length);
    const top = topH + K.r(n === 1 ? H * 0.04 : H * 0.06);
    const bottom = H - botH - K.r(n === 1 ? H * 0.12 : H * 0.04);
    const rowH = (bottom - top) / n;
    items.forEach((it, i) => {
      const rowTop = top + i * rowH, cyy = rowTop + rowH / 2;
      const boxW = K.r(W * (n === 1 ? 0.26 : 0.23));
      const boxH = K.r(Math.min(rowH * (n === 1 ? 0.78 : 0.72), H * (n === 1 ? 0.34 : 0.25)));
      if (i > 0) els.push({ type: 'rect', x: pad, y: K.r(rowTop), w: W - pad * 2, h: 3, color: theme.textMuted });
      const hasTime = Boolean(it.time);
      const nameX = hasTime ? pad + boxW + K.r(W * 0.02) : pad;
      const nameW = W - nameX - pad;
      if (it.time) {
        const by = K.r(cyy - boxH / 2);
        els.push({ type: 'rect', x: pad, y: by, w: boxW, h: boxH, color: red });
        els.push({ type: 'text', x: pad, y: by, w: boxW, h: boxH, text: it.time, font: 'display', weight: 800, color: white, align: 'center', valign: 'center', autofit: { min: K.r(H * 0.07), max: K.r(boxH * 0.66), lines: 1 } });
      }
      const hasV = Boolean(it.venue);
      els.push({ type: 'text', x: nameX, y: K.r(cyy - rowH * (hasV ? 0.27 : 0.2)), w: nameW, h: K.r(rowH * (hasV ? 0.3 : 0.4)), text: it.name, font: 'display', weight: 800, color: dark, align: hasTime ? 'left' : 'center', valign: hasV ? 'bottom' : 'center', autofit: { min: K.r(H * 0.055), max: K.r(rowH * (n === 1 ? 0.24 : 0.32)), lines: hasTime ? 1 : 2 } });
      if (hasV) els.push({ type: 'text', x: nameX, y: K.r(cyy + rowH * 0.05), w: nameW, h: K.r(rowH * 0.26), text: it.venue, font: 'display', weight: 800, color: dark, align: 'left', valign: 'center', autofit: { min: K.r(H * 0.05), max: K.r(rowH * (n === 1 ? 0.2 : 0.26)), lines: 1 } });
    });

    // Banda inferior: marca + chevrons.
    els.push({ type: 'rect', x: 0, y: H - botH, w: W, h: botH, color: dark });
    els.push({ type: 'logo', x: pad, y: K.r(H - botH + botH * 0.16), w: K.r(W * 0.46), h: K.r(botH * 0.68), text: brandText, color: paper, font: 'text', weight: 900, size: K.r(botH * 0.64) });
    const cs = K.r(botH * 0.24), chx = W - pad - K.r(W * 0.02), chy = H - botH / 2;
    let chev = '';
    [0, 1].forEach((k) => { const x = chx - k * cs * 1.1; chev += `<polyline points="${x - cs},${chy - cs} ${x},${chy} ${x - cs},${chy + cs}" fill="none" stroke="${red}" stroke-width="${Math.round(cs * 0.4)}" stroke-linecap="round" stroke-linejoin="round"/>`; });
    const chevX = K.r(chx - cs * 2.4), chevY = K.r(chy - cs * 1.5);
    const chevW = K.r(cs * 3.0), chevH = K.r(cs * 3.0);
    els.push({ type: 'svg', decorative: true, x: chevX, y: chevY, w: chevW, h: chevH, svg: `<svg viewBox="${chevX} ${chevY} ${chevW} ${chevH}" width="100%" height="100%">${chev}</svg>` });

    return { background: { type: 'solid', color: paper }, elements: els };
  },
};
