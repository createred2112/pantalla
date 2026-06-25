'use strict';
// AGENDA — banda superior (acento) con la etiqueta + flecha, filas de evento con
// la HORA en caja de acento + nombre grande + lugar, y banda inferior (carbón)
// con el wordmark y chevrons. Cada línea del cuerpo: "HORA | Evento | Lugar".
module.exports = {
  id: 'agenda',
  label: 'Agenda / Lista del día',
  hint: { title: 'Etiqueta de la banda (p. ej. AGENDA)', subtitle: '—', body: 'Una línea por evento: HORA | Nombre | Lugar', date: '—' },
  defaultTheme: 'blanco',
  logo: false, // dibuja su propio wordmark en la banda inferior
  frame(card, ctx) {
    const { W, H, font, fontDisplay, lib, theme } = ctx;
    const pad = Math.round(W * 0.03);
    const acc = '#D6FF00';       // bandas y cajas en lima (firma de la agenda)
    const accText = '#0E0E0E';
    const dark = '#0E0E0E';

    const topH = Math.round(H * 0.14);
    const botH = Math.round(H * 0.13);

    // --- Banda superior (acento) ---
    const labelTxt = (card.title || 'AGENDA').toUpperCase();
    const labelSize = Math.round(topH * 0.42);
    const topBand =
      `<rect x="0" y="0" width="${W}" height="${topH}" fill="${acc}"/>` +
      lib.textBlock([labelTxt], { x: pad, y: Math.round(topH * 0.66), size: labelSize, font, weight: 800, fill: dark, letterSpacing: 2 }) +
      // Caja negra con flecha a la derecha.
      (() => {
        const s = topH; const x0 = W - s; const a = s * 0.32; const cx = x0 + s / 2; const cy = topH / 2; const sw = Math.round(s * 0.08);
        return `<rect x="${x0}" y="0" width="${s}" height="${s}" fill="${dark}"/>` +
          `<line x1="${cx - a}" y1="${cy + a}" x2="${cx + a}" y2="${cy - a}" stroke="${acc}" stroke-width="${sw}" stroke-linecap="round"/>` +
          `<polyline points="${cx + a * 0.1},${cy - a} ${cx + a},${cy - a} ${cx + a},${cy + a * 0.1}" fill="none" stroke="${acc}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`;
      })();

    // --- Filas de evento ---
    const items = String(card.body || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean).slice(0, 3)
      .map((line) => {
        const parts = line.split('|').map((p) => p.trim());
        return { time: parts[0] || '', name: (parts[1] || parts[0] || '').toUpperCase(), venue: (parts[2] || '').toUpperCase() };
      });
    const n = Math.max(1, items.length);
    const top = topH + Math.round(H * 0.03);
    const bottom = H - botH - Math.round(H * 0.02);
    const rowH = (bottom - top) / n;
    const boxW = Math.round(W * 0.26);
    const boxH = Math.round(rowH * 0.62);
    const nameX = pad + boxW + Math.round(W * 0.025);
    const nameMaxW = W - nameX - pad;

    const rows = items.map((it, i) => {
      const rowTop = top + i * rowH;
      const cy = rowTop + rowH / 2;
      // Caja de hora.
      const boxY = Math.round(cy - boxH / 2);
      const tFit = lib.fitText(it.time, { maxWidth: boxW - Math.round(W * 0.02), maxLines: 1, maxSize: Math.round(boxH * 0.7), minSize: Math.round(H * 0.05), weight: 800 });
      const box = it.time
        ? `<rect x="${pad}" y="${boxY}" width="${boxW}" height="${boxH}" fill="${acc}"/>` +
          lib.textBlock([tFit.lines[0]], { x: pad + boxW / 2, y: Math.round(boxY + boxH * 0.72), size: tFit.size, font: fontDisplay, weight: 800, fill: accText, anchor: 'middle' })
        : '';
      // Nombre + lugar.
      const hasVenue = Boolean(it.venue);
      const nFit = lib.fitText(it.name, { maxWidth: nameMaxW, maxLines: 1, maxSize: Math.round(rowH * (hasVenue ? 0.34 : 0.42)), minSize: Math.round(H * 0.035), weight: 800 });
      const nameBase = hasVenue ? Math.round(cy - rowH * 0.02) : Math.round(cy + nFit.size * 0.35);
      const name = lib.textBlock([nFit.lines[0]], { x: nameX, y: nameBase, size: nFit.size, font: fontDisplay, weight: 800, fill: dark });
      const venue = hasVenue
        ? lib.textBlock([it.venue], { x: nameX, y: Math.round(nameBase + rowH * 0.26), size: Math.round(rowH * 0.16), font, weight: 700, fill: dark })
        : '';
      const sep = i > 0 ? `<line x1="${pad}" y1="${Math.round(rowTop)}" x2="${W - pad}" y2="${Math.round(rowTop)}" stroke="rgba(14,14,14,0.25)" stroke-width="2"/>` : '';
      return sep + box + name + venue;
    }).join('\n');

    // --- Banda inferior (carbón) con wordmark + chevrons ---
    const wm = ctx.brand.wordmark || { a: 'Gasteiz', b: 'Berri' };
    const wmSize = Math.round(botH * 0.46);
    const wmY = Math.round(H - botH / 2 + wmSize * 0.35);
    const aw = lib.estimateWidth(wm.a, wmSize, 800);
    const chevX = W - pad - Math.round(W * 0.02);
    const cy2 = Math.round(H - botH / 2);
    const cs = Math.round(botH * 0.22);
    const chev = [0, 1].map((k) => {
      const x = chevX - k * cs * 1.1;
      return `<polyline points="${x - cs},${cy2 - cs} ${x},${cy2} ${x - cs},${cy2 + cs}" fill="none" stroke="${acc}" stroke-width="${Math.round(cs * 0.4)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }).join('');
    // Marca en la banda: logo subido (versión clara, la banda es negra) o, si no hay, el wordmark de texto.
    const brandEl = (ctx.logo && ctx.logo.light)
      ? `<image href="${ctx.logo.light}" x="${pad}" y="${Math.round(H - botH + botH * 0.25)}" width="${Math.round(W * 0.3)}" height="${Math.round(botH * 0.5)}" preserveAspectRatio="xMinYMid meet"/>`
      : `<text x="${pad}" y="${wmY}" font-family="${font}" font-size="${wmSize}" font-weight="800" fill="#FFFFFF">${lib.escapeXml(wm.a)}</text>` +
        `<text x="${Math.round(pad + aw)}" y="${wmY}" font-family="${font}" font-size="${wmSize}" font-weight="800" fill="${acc}">${lib.escapeXml(wm.b)}</text>`;
    const botBand =
      `<rect x="0" y="${H - botH}" width="${W}" height="${botH}" fill="${dark}"/>` +
      brandEl + chev;

    const svg =
      `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${W}" height="${H}" fill="${theme.bg}"/>
        ${rows}${topBand}${botBand}
      </svg>`;

    return { base: { solid: theme.bg }, svg };
  },
};
