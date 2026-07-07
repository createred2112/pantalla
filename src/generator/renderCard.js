'use strict';
// Renderiza una "cartela" generada a JPG usando sharp + composición SVG.
// No requiere navegador (ideal para VPS). Las plantillas viven en ./templates.
const fs = require('fs');
const path = require('path');
// config se carga ANTES que sharp: configura fontconfig (FONTCONFIG_FILE) para
// que librsvg encuentre las fuentes empaquetadas en assets/fonts.
const { cfg, paths, abs } = require('../config');
const sharp = require('sharp');
const templates = require('./templates');

// Capa base: foto a sangre (cover) o color sólido.
async function buildBase(base, card, W, H) {
  const photoPath = card.photo ? abs(card.photo) : null;
  if (base.photo && photoPath && fs.existsSync(photoPath)) {
    return {
      buffer: await sharp(photoPath)
        .resize(W, H, { fit: 'cover', position: 'attention' })
        .modulate({ brightness: 0.96 })
        .toBuffer(),
      hasPhoto: true,
    };
  }
  const color = base.solid || cfg.screen.background || '#0b1f3a';
  return {
    buffer: await sharp({ create: { width: W, height: H, channels: 3, background: color } }).jpeg().toBuffer(),
    hasPhoto: false,
  };
}

// Devuelve un logo como data-URI base64 (para incrustarlo en SVG de plantilla).
function logoDataUri(p) {
  try {
    if (!p) return null;
    const ap = abs(p);
    if (!fs.existsSync(ap)) return null;
    const ext = path.extname(ap).slice(1).toLowerCase() || 'png';
    const mime = ext === 'jpg' ? 'jpeg' : ext;
    return `data:image/${mime};base64,` + fs.readFileSync(ap).toString('base64');
  } catch { return null; }
}

// Marca/brand combinada (config + fondo de pantalla) que reciben las plantillas.
function brandCtx() {
  return Object.assign({ background: cfg.screen.background }, cfg.brand);
}

const FALLBACK_THEME = { bg: '#0E0E0E', bg2: '#0E0E0E', text: '#FFFFFF', textMuted: 'rgba(255,255,255,0.8)', accent: '#D6FF00', accentText: '#0E0E0E', logoAccent: '#D6FF00' };

// Resuelve el tema de color: el de la cartela, si no el de la plantilla, si no el por defecto.
function resolveTheme(card, tpl) {
  const palette = cfg.palette || {};
  const key = card.theme || tpl.defaultTheme || (cfg.defaults && cfg.defaults.theme) || 'carbon';
  const t = palette[key] || palette.carbon || FALLBACK_THEME;
  return Object.assign({ key }, FALLBACK_THEME, t);
}

// Contexto de render (tema, fuentes, logo, foto) compartido por render y editor.
function buildCtx(card, tpl) {
  const W = cfg.screen.width, H = cfg.screen.height;
  const useImg = cfg.brand.logoMode !== 'none';
  const theme = resolveTheme(card, tpl);
  const hasPhoto = Boolean(card.photo) && (tpl.usesPhoto !== false);
  return {
    W, H, brand: brandCtx(), theme,
    font: cfg.brand.fontFamily || 'Arial, sans-serif',
    fontDisplay: cfg.brand.fontDisplay || cfg.brand.fontFamily || 'Arial, sans-serif',
    lib: templates.lib,
    logo: {
      light: useImg ? logoDataUri(cfg.brand.logoLight || cfg.brand.logo) : null,
      dark: useImg ? logoDataUri(cfg.brand.logoDark || cfg.brand.logo) : null,
    },
    hasPhoto,
    _onDark: hasPhoto || String(theme.text).toLowerCase() === '#ffffff' || tpl.logoOnDark === true,
  };
}

function defaultLogoElement(ctx, tpl) {
  if (!ctx || !tpl || tpl.logo === false || cfg.brand.logoMode === 'none') return null;
  const uri = ctx._onDark ? (ctx.logo && (ctx.logo.light || ctx.logo.dark)) : (ctx.logo && (ctx.logo.dark || ctx.logo.light));
  const text = cfg.brand.website || [cfg.brand.wordmark && cfg.brand.wordmark.a, cfg.brand.wordmark && cfg.brand.wordmark.b].filter(Boolean).join('') || cfg.brand.name || '';
  if (!uri && !text) return null;
  const { W, H } = ctx;
  const pos = tpl.logoPos || 'bl';
  const h = Math.round(H * ((Number(cfg.brand.logoWidth) || 9) / 100));
  const w = Math.round(W * 0.24);
  const mx = Math.round(W * 0.045);
  const my = Math.round(H * 0.05);
  return {
    id: 'brand_logo',
    type: 'logo',
    x: pos.includes('r') ? W - mx - w : mx,
    y: pos.includes('t') ? my : H - my - h,
    w,
    h,
    src: uri,
    text,
    color: ctx._onDark ? '#FFFFFF' : (ctx.theme.logoAccent || ctx.theme.text),
    colorTheme: ctx._onDark ? null : (ctx.theme.logoAccent ? 'logoAccent' : 'text'),
    fit: 'contain',
    font: 'text',
    weight: 900,
  };
}

function ensureLogoElement(frame, ctx, tpl) {
  if (!frame || !Array.isArray(frame.elements) || tpl.logo === false) return frame;
  const elements = [...frame.elements];
  const idx = elements.findIndex((el) => el.type === 'logo' || el.id === 'brand_logo');
  const fresh = defaultLogoElement(ctx, tpl);
  if (!fresh) {
    if (idx >= 0) elements.splice(idx, 1);
    return { ...frame, elements };
  }
  if (idx >= 0) {
    elements[idx] = {
      ...elements[idx],
      src: fresh.src,
      text: fresh.text,
      color: elements[idx].colorFixed ? elements[idx].color : fresh.color,
      colorTheme: elements[idx].colorFixed ? elements[idx].colorTheme : fresh.colorTheme,
      fit: elements[idx].fit || 'contain',
    };
  } else {
    elements.push(fresh);
  }
  return { ...frame, elements };
}

// Deduce a qué campo (title/subtitle/body/date) corresponde un texto generado.
function inferBind(el, card) {
  if (el.type !== 'text' && el.type !== 'chip') return null;
  for (const f of ['title', 'subtitle', 'body', 'date']) {
    const v = card[f]; if (!v) continue;
    if (el.text === v || el.text === String(v).toUpperCase()) return f;
  }
  return null;
}

function themeValue(ctx, key) {
  const theme = (ctx && ctx.theme) || {};
  return theme[key] || null;
}

function dynamicText(card, bind) {
  if (!bind) return null;
  if (bind === 'weatherSummary') return weatherSummary(card).toUpperCase();
  if (card[bind] == null) return null;
  return String(card[bind]);
}

function refreshDynamicElement(el, card, ctx, svgOrder) {
  const next = { ...el };
  if (next.bind) {
    const text = dynamicText(card, next.bind);
    if (text != null) next.text = next.transform === 'upper' ? String(text).toUpperCase() : String(text);
  }
  if (next.type === 'svg' && /<svg/i.test(String(next.svg || ''))) {
    const clima = require('./templates/clima');
    if (card.template === 'clima') {
      const key = clima.keyOf(card.subtitle);
      next.anim = clima.animFor(key);
      next.svg = clima.iconSvg(key, clima.iconColor(ctx.theme));
    } else if (card.template === 'prevision') {
      const days = forecastDays(card);
      const day = days[svgOrder.count] || days[0] || null;
      svgOrder.count++;
      const key = clima.keyOf(day && day.cond);
      next.anim = clima.animFor(key);
      next.svg = clima.iconSvg(key, clima.iconColor(ctx.theme));
    }
  }
  return next;
}

// Diseños ANTIGUOS (guardados antes de que el editor anotara colorTheme):
// se deduce con qué tema de la paleta se guardó el layout (el que explique más
// colores) y se re-ligan esos colores a sus roles (bg, texto, acento...) del
// tema ACTUAL. Sin esto, los predeterminados viejos dejan los colores clavados
// e ignoran el tema elegido en la cartela.
const TOKEN_KEYS = ['bg', 'text', 'accent', 'accentText', 'bg2', 'textMuted', 'logoAccent'];

function norm(color) {
  return String(color || '').trim().toLowerCase();
}

// Mapa color->rol del tema de la paleta que mejor explica los colores usados.
function legacyTokenMap(layout, currentTheme) {
  const used = new Set();
  if (layout.background && layout.background.color && !layout.background.colorTheme && !layout.background.colorFixed) used.add(norm(layout.background.color));
  for (const e of layout.elements || []) {
    if (e.color && !e.colorTheme && !e.colorFixed) used.add(norm(e.color));
    if (e.bg && !e.bgTheme && !e.bgFixed) used.add(norm(e.bg));
  }
  used.delete('');
  if (!used.size) return {};
  let best = null;
  let bestHits = 0;
  const themes = [currentTheme, ...Object.values(cfg.palette || {})].filter(Boolean);
  for (const theme of themes) {
    let hits = 0;
    for (const v of used) if (TOKEN_KEYS.some((k) => norm(theme[k]) === v)) hits++;
    if (hits > bestHits) { bestHits = hits; best = theme; }
  }
  // Con menos de 2 coincidencias no hay evidencia suficiente: se deja fijo.
  if (!best || bestHits < 2) return {};
  const map = {};
  for (const k of TOKEN_KEYS) {
    const v = norm(best[k]);
    if (v && !(v in map)) map[v] = k;
  }
  return map;
}

// Aplica un layout (elementos) a los datos de la cartela (refresca texto vinculado
// y mantiene vivos los colores ligados al tema cuando el editor los guardó así).
function applyLayout(layout, card, ctx, tpl) {
  const legacy = legacyTokenMap(layout, ctx && ctx.theme);
  const live = (explicitToken, rawColor, fixed) => {
    const token = explicitToken || (fixed ? null : legacy[norm(rawColor)]);
    return (token && themeValue(ctx, token)) || rawColor;
  };
  const bg = layout.background ? { ...layout.background } : undefined;
  if (bg && bg.color) bg.color = live(bg.colorTheme, bg.color, bg.colorFixed);
  const svgOrder = { count: 0 };
  const elements = (layout.elements || []).map((e) => {
    const el = refreshDynamicElement(e, card, ctx, svgOrder);
    if (el.color) el.color = live(el.colorTheme, el.color, el.colorFixed);
    if (el.bg) el.bg = live(el.bgTheme, el.bg, el.bgFixed);
    return el;
  });
  return ensureLogoElement({ background: bg, elements }, ctx, tpl || { id: card.template });
}

function sameText(a, b) {
  return norm(String(a || '').replace(/\s+/g, ' ')) === norm(String(b || '').replace(/\s+/g, ' '));
}

function parseRgb(color) {
  const s = String(color || '').trim().toLowerCase();
  let m = s.match(/^#([0-9a-f]{3})$/);
  if (m) return [...m[1]].map((h) => parseInt(h + h, 16));
  m = s.match(/^#([0-9a-f]{6})$/);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = s.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const p = m[1].split(',').map((x) => parseFloat(x));
    if (p.length >= 3 && p.slice(0, 3).every((v) => isFinite(v))) {
      return p.slice(0, 3).map((v) => Math.max(0, Math.min(255, v)));
    }
  }
  return null;
}

function relLum(rgb) {
  const f = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
}

function contrastRatio(fg, bg) {
  const a = relLum(fg), b = relLum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function readableTextColor(color, bg, dark = '#0E0E0E', light = '#FFFFFF') {
  const b = parseRgb(bg);
  const f = parseRgb(color);
  if (!b) return color || dark;
  if (f && contrastRatio(f, b) >= 4.5) return color;
  const d = parseRgb(dark);
  const l = parseRgb(light);
  if (!d || !l) return relLum(b) > 0.45 ? '#0E0E0E' : '#FFFFFF';
  return contrastRatio(d, b) >= contrastRatio(l, b) ? dark : light;
}

function readableBgColor(raw, fallback) {
  const direct = parseRgb(raw);
  if (direct) return raw;
  const colors = String(raw || '').match(/#[0-9a-f]{3,6}|rgba?\([^)]+\)/gi) || [];
  const parsed = colors.map(parseRgb).filter(Boolean);
  if (!parsed.length) return fallback;
  const avg = parsed.reduce((acc, rgb) => acc.map((v, i) => v + rgb[i]), [0, 0, 0])
    .map((v) => Math.round(v / parsed.length));
  return `rgb(${avg[0]},${avg[1]},${avg[2]})`;
}

function applyReadableColor(el, ctx, bg, preferred) {
  const current = preferred || el.color || ctx.theme.accentText || '#0E0E0E';
  const color = readableTextColor(current, readableBgColor(bg, ctx.theme.accent), '#0E0E0E', '#FFFFFF');
  const next = { ...el, color };
  if (norm(color) === norm(ctx.theme.accentText)) {
    next.colorTheme = 'accentText';
    delete next.colorFixed;
  } else if (norm(color) !== norm(el.color || '')) {
    delete next.colorTheme;
    next.colorFixed = true;
  }
  return next;
}

function airBandFor(elements, ctx, bodyEl) {
  const { W, H } = ctx;
  const bodyY = Number(bodyEl && bodyEl.y || 0);
  const bodyH = Number(bodyEl && bodyEl.h || 0);
  const candidates = elements.filter((el) =>
    (el.type === 'rect' || el.type === 'band') &&
    Number(el.w || 0) >= W * 0.55 &&
    Number(el.h || 0) >= H * 0.04 &&
    Number(el.y || 0) >= H * 0.4 &&
    Number(el.y || 0) <= H * 0.86
  );
  if (!bodyEl) return candidates[0] || null;
  candidates.sort((a, b) => {
    const ay = Number(a.y || 0), ah = Number(a.h || 0);
    const by = Number(b.y || 0), bh = Number(b.h || 0);
    const ao = Math.max(0, Math.min(ay + ah, bodyY + bodyH) - Math.max(ay, bodyY));
    const bo = Math.max(0, Math.min(by + bh, bodyY + bodyH) - Math.max(by, bodyY));
    return bo - ao;
  });
  return candidates[0] || null;
}

function ensureOrder(elements, lower, upper) {
  if (!lower || !upper) return elements;
  const lowerIdx = elements.indexOf(lower);
  const upperIdx = elements.indexOf(upper);
  if (lowerIdx < 0 || upperIdx < 0 || lowerIdx < upperIdx) return elements;
  const next = elements.filter((el) => el !== lower && el !== upper);
  next.splice(Math.max(0, upperIdx), 0, lower, upper);
  return next;
}

function isAirBodyCandidate(el, card, band) {
  if (!el || (el.type !== 'text' && el.type !== 'chip')) return false;
  const bodyText = airBodyText(card);
  if (el.bind === 'body' || sameText(el.text, bodyText)) return true;
  if (/peor\s+indicador|indice\s+europeo|índice\s+europeo/i.test(String(el.text || ''))) return true;
  if (!band) return false;
  const y = Number(el.y || 0), h = Number(el.h || 0);
  const by = Number(band.y || 0), bh = Number(band.h || 0);
  const overlap = Math.max(0, Math.min(y + h, by + bh) - Math.max(y, by));
  return overlap >= Math.min(Math.max(1, h), Math.max(1, bh)) * 0.45;
}

function airBodyText(card) {
  const body = String(card && card.body || '').trim();
  if (body) return body;
  const data = (card && card.data) || {};
  const worst = data.worstIndicator || (data.extra && data.extra.worstIndicator) || null;
  const label = worst && String(worst.label || worst.desc || '').trim();
  if (label) return `Peor indicador: ${label.toUpperCase()}`;
  if (data.europeanAqi != null) return `Indice europeo: ${data.europeanAqi}`;
  return '';
}

function airBodyElement(card, ctx, band, base = null) {
  const { W, H, theme } = ctx;
  const pad = Math.round(W * 0.05);
  const bodyText = airBodyText(card);
  const fallback = {
    id: 'el_air_body_guard',
    type: 'text',
    bind: 'body',
    x: pad,
    y: band.y,
    w: W - pad * 2,
    h: band.h,
    text: bodyText.toUpperCase(),
    font: 'display',
    weight: 800,
    color: theme.accentText,
    colorTheme: 'accentText',
    align: 'center',
    valign: 'center',
    lineHeight: 1,
    autofit: { min: Math.round(H * 0.04), max: Math.round(H * 0.075), lines: 1 },
  };
  const next = {
    ...fallback,
    ...(base || {}),
    id: (base && base.id) || fallback.id,
    type: 'text',
    bind: 'body',
    text: bodyText.toUpperCase(),
    font: (base && base.font) || fallback.font,
    weight: (base && base.weight) || fallback.weight,
    color: (base && base.color) || fallback.color,
    colorTheme: (base && base.colorTheme) || fallback.colorTheme,
    autofit: (base && base.autofit) || fallback.autofit,
  };
  return applyReadableColor(next, ctx, band.gradient || band.color || theme.accent, next.color || theme.accentText);
}

function repairAirFrame(card, ctx, frame, opts = {}) {
  if (!airBodyText(card)) return frame;
  const { W, H, theme } = ctx;
  let elements = Array.isArray(frame.elements) ? [...frame.elements] : [];
  const bodyText = airBodyText(card);
  const idx = elements.findIndex((el) =>
    (el.type === 'text' || el.type === 'chip') &&
    (el.bind === 'body' || sameText(el.text, bodyText))
  );

  if (opts.preserveLayout && idx >= 0) {
    const originalBody = elements[idx];
    let band = airBandFor(elements, ctx, originalBody);
    if (!band) {
      band = {
        id: 'el_air_band_guard',
        type: 'rect',
        x: 0,
        y: Number(originalBody.y || Math.round(H * 0.64)),
        w: W,
        h: Number(originalBody.h || Math.round(H * 0.13)),
        color: theme.accent,
        colorTheme: 'accent',
      };
      elements.splice(idx, 0, band);
    }
    const body = airBodyElement(card, ctx, band, originalBody);
    elements = elements.filter((el) => el === band || !isAirBodyCandidate(el, card, band));
    const bandIndex = elements.indexOf(band);
    elements.splice(Math.max(0, bandIndex + 1), 0, body);
    return { ...frame, elements };
  }

  let band = airBandFor(elements, ctx, idx >= 0 ? elements[idx] : null);
  if (!band) {
    band = {
      id: 'el_air_band_guard',
      type: 'rect',
      x: 0,
      y: Math.round(H * 0.64),
      w: W,
      h: Math.round(H * 0.13),
      color: theme.accent,
      colorTheme: 'accent',
    };
    elements.push(band);
  } else {
    band.x = 0;
    band.w = W;
    if (!opts.preserveLayout) {
      band.color = theme.accent;
      band.colorTheme = 'accent';
      delete band.colorFixed;
    }
  }

  const body = idx >= 0 ? airBodyElement(card, ctx, band, elements[idx]) : airBodyElement(card, ctx, band);
  elements = elements.filter((el) => el === band || !isAirBodyCandidate(el, card, band));
  const bandIndex = elements.indexOf(band);
  elements.splice(Math.max(0, bandIndex + 1), 0, body);
  return { ...frame, elements };
}

function weatherSummary(card) {
  const range = card.body || (card.data && card.data.max != null && card.data.min != null ? `Máx ${card.data.max}º · mín ${card.data.min}º` : '');
  return [card.subtitle || '', range].filter(Boolean).join(' · ');
}

function weatherIconElement(card, ctx) {
  const { W, H, theme } = ctx;
  const clima = require('./templates/clima');
  const pad = Math.round(W * 0.05);
  const zoneY = Math.round(H * 0.145);
  const zoneH = Math.round(H * 0.51);
  const icoS = Math.round(Math.min(zoneH, W * 0.36));
  return {
    id: 'el_weather_icon_guard',
    type: 'svg',
    anim: clima.animFor(clima.keyOf(card.subtitle)),
    x: Math.round(W - pad - icoS),
    y: Math.round(zoneY + (zoneH - icoS) / 2),
    w: icoS,
    h: icoS,
    svg: clima.iconSvg(clima.keyOf(card.subtitle), clima.iconColor(theme)),
  };
}

function weatherBandTextElement(card, ctx, band, base = null) {
  const { W, H, theme } = ctx;
  const pad = Math.round(W * 0.05);
  const fallback = {
    id: 'el_weather_band_text_guard',
    type: 'text',
    bind: 'weatherSummary',
    x: pad,
    y: band.y,
    w: W - pad * 2,
    h: band.h,
    text: weatherSummary(card).toUpperCase(),
    font: 'display',
    weight: 800,
    color: theme.accentText,
    colorTheme: 'accentText',
    align: 'center',
    valign: 'center',
    lineHeight: 1,
    letterSpacingEm: 0,
    autofit: { min: Math.round(H * 0.045), max: Math.round(H * 0.08), lines: 1 },
  };
  const next = {
    ...fallback,
    ...(base || {}),
    id: (base && base.id) || fallback.id,
    type: 'text',
    bind: 'weatherSummary',
    text: weatherSummary(card).toUpperCase(),
    font: (base && base.font) || fallback.font,
    weight: (base && base.weight) || fallback.weight,
    color: (base && base.color) || fallback.color,
    colorTheme: (base && base.colorTheme) || fallback.colorTheme,
    autofit: (base && base.autofit) || fallback.autofit,
  };
  return applyReadableColor(next, ctx, band.color || theme.accent, next.color || theme.accentText);
}

function overlapsY(el, y, h) {
  const top = Number(el.y || 0);
  const bottom = top + Number(el.h || 0);
  return bottom > y && top < y + h;
}

function isProtectedWeatherText(el, card) {
  if (!el || el.type !== 'text') return false;
  return el.bind === 'title' ||
    el.bind === 'date' ||
    sameText(el.text, card.title) ||
    sameText(el.text, card.date);
}

function repairWeatherFrame(card, ctx, frame, opts = {}) {
  const { W, H, theme } = ctx;
  const elements = Array.isArray(frame.elements) ? [...frame.elements] : [];

  const icon = weatherIconElement(card, ctx);
  const svgIdx = elements.findIndex((el) => el.type === 'svg' && /<svg/i.test(String(el.svg || '')));
  if (svgIdx >= 0) {
    elements[svgIdx] = opts.preserveLayout
      ? { ...icon, ...elements[svgIdx], type: 'svg', anim: icon.anim, svg: icon.svg }
      : { ...elements[svgIdx], ...icon };
  }
  else elements.push(icon);

  const summary = weatherSummary(card);
  if (summary) {
    let band = elements.find((el) =>
      (el.type === 'rect' || el.type === 'band') &&
      Number(el.w || 0) >= W * 0.8 &&
      Number(el.h || 0) >= H * 0.08 &&
      Number(el.y || 0) >= H * 0.5 &&
      Number(el.y || 0) <= H * 0.84
    );
    if (!band) {
      band = {
        id: 'el_weather_band_guard',
        type: 'rect',
        x: 0,
        y: Math.round(H * 0.67),
        w: W,
        h: Math.round(H * 0.16),
        color: theme.accent,
        colorTheme: 'accent',
      };
      elements.push(band);
    } else {
      band.x = 0;
      band.w = W;
      band.h = Math.max(Number(band.h) || 0, Math.round(H * 0.14));
      band.color = theme.accent;
      band.colorTheme = 'accent';
      delete band.colorFixed;
    }
    const bandY = Number(band.y || 0);
    const bandH = Number(band.h || 0);
    const layoutText = opts.preserveLayout ? elements.find((el) => {
      if (el.type !== 'text') return false;
      const isWeatherText = el.bind === 'weatherSummary' ||
        el.bind === 'subtitle' ||
        el.bind === 'body' ||
        sameText(el.text, card.subtitle) ||
        sameText(el.text, card.body) ||
        sameText(el.text, summary);
      return isWeatherText && overlapsY(el, bandY, bandH);
    }) : null;
    const bandText = weatherBandTextElement(card, ctx, band, layoutText);
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      if (el === band || el.type !== 'text') continue;
      const isWeatherText = el.bind === 'weatherSummary' ||
        el.bind === 'subtitle' ||
        el.bind === 'body' ||
        sameText(el.text, card.subtitle) ||
        sameText(el.text, card.body) ||
        sameText(el.text, summary);
      if (isWeatherText || (!isProtectedWeatherText(el, card) && overlapsY(el, bandY, bandH))) elements.splice(i, 1);
    }
    const bandIndex = elements.indexOf(band);
    elements.splice(Math.max(0, bandIndex + 1), 0, bandText);
  }

  return { ...frame, elements };
}

function forecastDays(card) {
  const d = card && card.data ? card.data : {};
  return Array.isArray(d.days) ? d.days.slice(0, 3) : [];
}

function forecastIconElement(day, i, count, ctx) {
  const { W, H, theme } = ctx;
  const clima = require('./templates/clima');
  const pad = Math.round(W * 0.05);
  const colW = Math.round((W - pad * 2) / Math.max(1, count));
  const x = pad + i * colW;
  const icoS = Math.round(H * 0.25);
  const key = clima.keyOf(day && day.cond);
  return {
    id: `el_forecast_icon_guard_${i}`,
    type: 'svg',
    anim: clima.animFor(key),
    x: Math.round(x + (colW - icoS) / 2),
    y: Math.round(H * 0.285),
    w: icoS,
    h: icoS,
    svg: clima.iconSvg(key, clima.iconColor(theme)),
  };
}

function repairForecastFrame(card, ctx, frame, opts = {}) {
  const days = forecastDays(card);
  if (!days.length) return frame;
  const src = Array.isArray(frame.elements) ? frame.elements : [];
  if (!opts.preserveLayout) {
    const elements = src.filter((el) => el.type !== 'svg' || !/<svg/i.test(String(el.svg || '')));
    days.forEach((day, i) => elements.push(forecastIconElement(day, i, days.length, ctx)));
    return { ...frame, elements };
  }
  let iconIndex = 0;
  const elements = [];
  for (const el of src) {
    if (el.type === 'svg' && /<svg/i.test(String(el.svg || ''))) {
      const day = days[iconIndex];
      if (day) {
        const icon = forecastIconElement(day, iconIndex, days.length, ctx);
        elements.push({ ...icon, ...el, type: 'svg', anim: icon.anim, svg: icon.svg });
      }
      iconIndex++;
      continue;
    }
    elements.push(el);
  }
  for (let i = iconIndex; i < days.length; i++) elements.push(forecastIconElement(days[i], i, days.length, ctx));
  return { ...frame, elements };
}

function repairFrameForCard(card, ctx, frame, opts = {}) {
  if (card && card.template === 'aire') return repairAirFrame(card, ctx, frame, opts);
  if (card && card.template === 'clima') return repairWeatherFrame(card, ctx, frame, opts);
  if (card && card.template === 'prevision') return repairForecastFrame(card, ctx, frame, opts);
  return frame;
}

// Frame resuelto, por prioridad: layout propio de la cartela > layout por defecto
// de la plantilla > el que genera la plantilla en código.
function resolveFrame(card, ctx, tpl) {
  if (card.layout && Array.isArray(card.layout.elements)) {
    return repairFrameForCard(card, ctx, applyLayout(card.layout, card, ctx, tpl), { preserveLayout: true });
  }
  const tl = require('../templateLayouts').get(card.template, ctx.theme && ctx.theme.key);
  if (tl && Array.isArray(tl.elements)) {
    return repairFrameForCard(card, ctx, applyLayout(tl, card, ctx, tpl), { preserveLayout: true });
  }
  const frame = tpl.build(card, ctx) || { elements: [] };
  frame.elements = (frame.elements || []).map((e, i) => Object.assign({ id: 'el' + i, bind: inferBind(e, card) }, e));
  return ensureLogoElement(repairFrameForCard(card, ctx, frame), ctx, tpl);
}

// Resuelve el frame para el editor (sin renderizar): { W, H, background, elements }.
function resolveForEditor(card) {
  const tpl = templates.get(card.template);
  if (typeof tpl.build !== 'function') return null;
  const ctx = buildCtx(card, tpl);
  const frame = resolveFrame(card, ctx, tpl);
  return { W: ctx.W, H: ctx.H, template: tpl.id, photo: card.photo || null, fontDisplay: ctx.fontDisplay, fontText: ctx.font, theme: ctx.theme, hasOwnLayout: Boolean(card.layout && Array.isArray(card.layout.elements)), background: frame.background || { type: 'solid', color: ctx.theme.bg }, elements: frame.elements };
}

async function renderToBuffer(card) {
  const W = cfg.screen.width;
  const H = cfg.screen.height;
  const tpl = templates.get(card.template);
  const ctx = buildCtx(card, tpl);

  // Motor HTML/Chromium para plantillas migradas (exportan build()).
  if (typeof tpl.build === 'function') {
    const frame = resolveFrame(card, ctx, tpl);
    return require('./htmlRender').renderFrame(card, ctx, tpl, frame);
  }

  // --- Motor SVG/sharp (plantillas aún sin migrar) ---
  templates.lib.setScale(Number(cfg.brand.textScale) || 1);
  const { base, svg } = tpl.frame(card, ctx);
  const { buffer: baseBuf, hasPhoto } = await buildBase(base || {}, card, W, H);

  const layers = [{ input: Buffer.from(svg) }];

  // Marca: solo imagen real subida. Si no existe, no se inventa una marca.
  if (tpl.logo !== false) {
    const pos = tpl.logoPos || 'bl';
    const darkBg = hasPhoto || String(ctx.theme.text).toLowerCase() === '#ffffff';
    // Elige logo claro (fondos oscuros) u oscuro (fondos claros); fallback al que haya.
    const chosen = darkBg ? (cfg.brand.logoLight || cfg.brand.logo) : (cfg.brand.logoDark || cfg.brand.logo);
    const logoPath = (cfg.brand.logoMode !== 'none' && chosen) ? abs(chosen) : null;

    if (logoPath && fs.existsSync(logoPath)) {
      // Tamaño por ALTO, con tope de ancho.
      const pct = Number(cfg.brand.logoWidth) || 9;
      const boxH = Math.round(H * (pct / 100));
      const boxW = Math.round(W * 0.24);
      const logo = await sharp(logoPath).resize({ width: boxW, height: boxH, fit: 'inside', withoutEnlargement: false }).toBuffer();
      const meta = await sharp(logo).metadata();
      const mx = Math.round(W * 0.045);
      const my = Math.round(H * 0.05);
      const left = pos.includes('r') ? W - mx - (meta.width || 0) : mx;
      const top = pos.includes('b') ? H - my - (meta.height || 0) : my;
      layers.push({ input: logo, top, left });
    }
  }

  let pipeline = sharp(baseBuf).composite(layers);
  const requested = (cfg.screen.format || 'jpg').toLowerCase();
  const ext = requested === 'png' ? 'png' : 'jpg';
  if (ext === 'png') pipeline = pipeline.png();
  else pipeline = pipeline.jpeg({ quality: cfg.screen.quality || 88, mozjpeg: true });

  const buffer = await pipeline.toBuffer();
  return { buffer, ext };
}

async function renderToFile(card) {
  const { buffer, ext } = await renderToBuffer(card);
  fs.mkdirSync(paths.output, { recursive: true });
  const file = path.join(paths.output, `${card.id}.${ext}`);
  fs.writeFileSync(file, buffer);
  return file;
}

// Prepara ctx + plantilla + frame resuelto (para el motor de vídeo).
function prepare(card) {
  const tpl = templates.get(card.template);
  if (typeof tpl.build !== 'function') return null;
  const ctx = buildCtx(card, tpl);
  return { ctx, tpl, frame: resolveFrame(card, ctx, tpl) };
}

module.exports = { renderToBuffer, renderToFile, resolveForEditor, prepare };
