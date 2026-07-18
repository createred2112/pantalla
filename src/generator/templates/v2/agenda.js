'use strict';
// AGENDA v2 — diseñada para un panel LED de muy baja resolución efectiva.
// Cada frame contiene UN solo evento. El motor de vídeo convierte todas las
// líneas de body en escenas consecutivas dentro del mismo MP4.
const K = require('./_kit');
const v1 = require('../agenda');

const EXPO_RE = /^(expo|exposici[oó]n|erakusketa)$/i;

function screenText(value, max) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

function dayLabel(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return '';
  try {
    return new Date(`${value}T12:00:00`).toLocaleDateString('es-ES', {
      weekday: 'short', day: 'numeric',
    }).replace('.', '').toUpperCase();
  } catch { return ''; }
}

function looksLikeSignal(value) {
  return /^\d{1,2}[:.]\d{2}$/.test(String(value || '')) || EXPO_RE.test(String(value || ''));
}

function parseAgendaLine(line) {
  const raw = String(line || '').trim();
  if (!raw) return null;
  const p = raw.split('|').map((x) => x.trim());
  const dated = /^\d{4}-\d{2}-\d{2}$/.test(p[0] || '');
  let date = '';
  let signal = '';
  let name = '';
  let venue = '';

  if (dated) {
    date = dayLabel(p[0]);
    signal = p[1] || '';
    name = p[2] || '';
    venue = p.slice(3).filter(Boolean).join(' · ');
  } else if (p.length >= 3) {
    signal = p[0] || '';
    name = p[1] || '';
    venue = p.slice(2).filter(Boolean).join(' · ');
  } else if (p.length === 2 && looksLikeSignal(p[0])) {
    signal = p[0];
    name = p[1];
  } else if (p.length === 2) {
    name = p[0];
    venue = p[1];
  } else {
    const prefixed = raw.match(/^(EXPO|\d{1,2}[:.hH]\d{2})\s+(.+)$/i);
    if (prefixed) {
      signal = prefixed[1];
      name = prefixed[2];
    } else {
      name = raw;
    }
  }

  if (!name) return null;
  const expo = EXPO_RE.test(signal);
  return {
    date,
    signal: expo ? 'EXPO' : (signal ? signal.replace('.', ':').toUpperCase() : 'EVENTO'),
    kind: expo ? 'expo' : (signal ? 'time' : 'event'),
    name: screenText(name, 56).toUpperCase(),
    venue: screenText(venue, 38).toUpperCase(),
  };
}

function parseItems(card) {
  return String(card && card.body || '').split(/\r?\n/).map(parseAgendaLine).filter(Boolean);
}

function videoScenes(card) {
  const lines = String(card && card.body || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return (lines.length ? lines : ['EVENTO | SIN EVENTOS']).map((line, index) => ({
    ...card,
    body: line,
    _agendaSceneIndex: index,
    _agendaSceneCount: Math.max(1, lines.length),
  }));
}

module.exports = {
  ...v1,
  parseAgendaLine,
  parseItems,
  videoScenes,
  build(card, ctx) {
    const { W, H, theme } = ctx;
    const pad = K.r(W * 0.052);
    const accent = theme.accent;
    const accentText = theme.accentText;
    const paper = theme.bg;
    const dark = theme.text;
    const topH = K.r(H * 0.17);
    const botH = K.r(H * 0.13);
    const els = [];
    const item = parseItems(card)[0] || { signal: 'EVENTO', kind: 'event', name: 'SIN EVENTOS', venue: '', date: '' };
    const cleanTitle = String(card.title || '').trim();
    const title = (!cleanTitle || cleanTitle.length < 3) ? 'AGENDA' : cleanTitle;
    const subtitle = String(card.subtitle || item.date || '').trim();
    const brand = ctx.brand || {};
    const wordmark = brand.wordmark || {};
    const brandText = (wordmark.a || wordmark.b)
      ? `${wordmark.a || ''}${wordmark.b || ''}.com`
      : (brand.website || brand.name || 'GasteizBerri.com');

    // Cabecera de alto contraste. Solo dos mensajes: AGENDA y HOY/MAÑANA.
    els.push({ type: 'rect', x: 0, y: 0, w: W, h: topH, color: accent });
    els.push({
      type: 'text', x: pad, y: K.r(topH * 0.08), w: K.r(W * 0.52), h: K.r(topH * 0.84),
      text: title.toUpperCase(), font: 'display', weight: 800, color: accentText,
      align: 'left', valign: 'center', lineHeight: 0.9,
      autofit: { min: K.r(H * 0.085), max: K.r(H * 0.13), lines: 1 },
    });
    if (subtitle) {
      els.push({
        type: 'text', x: K.r(W * 0.57), y: K.r(topH * 0.08), w: W - K.r(W * 0.57) - pad, h: K.r(topH * 0.84),
        text: subtitle.toUpperCase(), font: 'display', weight: 800, color: accentText,
        align: 'right', valign: 'center', lineHeight: 0.9,
        autofit: { min: K.r(H * 0.075), max: K.r(H * 0.115), lines: 1 },
      });
    }

    // Un único evento ocupa toda la zona útil. A resolución LED efectiva,
    // el rótulo y el titular siguen conservando decenas de píxeles de altura.
    // Retícula vertical: la caja de señal, el titular y el lugar comparten
    // exactamente el mismo borde superior e inferior imaginarios.
    const mainTop = topH + K.r(H * 0.095);
    const mainBottom = H - botH - K.r(H * 0.075);
    const mainH = mainBottom - mainTop;
    const signalW = K.r(W * 0.235);
    const signalH = mainH;
    const signalY = mainTop;
    const signalColor = item.kind === 'expo' ? '#5537B8' : (item.kind === 'time' ? accent : dark);
    els.push({ type: 'rect', x: pad, y: signalY, w: signalW, h: signalH, color: signalColor, colorFixed: item.kind === 'expo' });
    els.push({
      type: 'text', x: pad, y: signalY, w: signalW, h: signalH,
      text: item.signal, font: 'display', weight: 800, color: '#FFFFFF', colorFixed: true,
      align: 'center', valign: 'center', lineHeight: 0.88, letterSpacingEm: -0.02,
      autofit: { min: K.r(H * 0.10), max: K.r(H * 0.18), lines: 1 },
    });

    const gap = K.r(W * 0.035);
    const textX = pad + signalW + gap;
    const textW = W - textX - pad;
    const hasVenue = Boolean(item.venue);
    els.push({
      type: 'text', x: textX, y: mainTop, w: textW, h: K.r(mainH * (hasVenue ? 0.65 : 1)),
      // Archivo semibold abre la letra y evita la mancha negra de la display
      // condensada, manteniendo un trazo seguro para el panel LED.
      text: item.name, font: 'wide', weight: 600, color: dark,
      align: 'left', valign: hasVenue ? 'top' : 'center', lineHeight: 1.02, letterSpacingEm: 0.004,
      autofit: { min: K.r(H * 0.09), max: K.r(H * 0.17), lines: 2 },
    });
    if (hasVenue) {
      els.push({ type: 'rect', x: textX, y: K.r(mainTop + mainH * 0.68), w: K.r(textW * 0.16), h: K.r(H * 0.012), color: signalColor, colorFixed: item.kind === 'expo' });
      els.push({
        type: 'text', x: textX, y: K.r(mainTop + mainH * 0.75), w: textW, h: K.r(mainH * 0.25),
        text: item.venue, font: 'wide', weight: 600, color: dark,
        align: 'left', valign: 'bottom', lineHeight: 1,
        autofit: { min: K.r(H * 0.062), max: K.r(H * 0.088), lines: 1 },
      });
    }

    // Pie mínimo de marca, todavía grande en la matriz LED.
    els.push({ type: 'rect', x: 0, y: H - botH, w: W, h: botH, color: dark });
    els.push({
      type: 'logo', x: pad, y: K.r(H - botH + botH * 0.16), w: K.r(W * 0.55), h: K.r(botH * 0.68),
      text: brandText, color: paper, font: 'text', weight: 900, size: K.r(botH * 0.64),
    });
    const count = Number(card._agendaSceneCount) || parseItems(card).length;
    const index = Number(card._agendaSceneIndex) || 0;
    if (count > 1) {
      els.push({
        type: 'text', x: K.r(W * 0.76), y: H - botH, w: W - K.r(W * 0.76) - pad, h: botH,
        text: `${index + 1}/${count}`, font: 'display', weight: 800, color: paper,
        align: 'right', valign: 'center', size: K.r(H * 0.075),
      });
    }

    return { background: { type: 'solid', color: paper }, elements: els };
  },
};
