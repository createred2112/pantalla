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
function applyLayout(layout, card, ctx) {
  const legacy = legacyTokenMap(layout, ctx && ctx.theme);
  const live = (explicitToken, rawColor, fixed) => {
    const token = explicitToken || (fixed ? null : legacy[norm(rawColor)]);
    return (token && themeValue(ctx, token)) || rawColor;
  };
  const bg = layout.background ? { ...layout.background } : undefined;
  if (bg && bg.color) bg.color = live(bg.colorTheme, bg.color, bg.colorFixed);
  const elements = (layout.elements || []).map((e) => {
    const el = { ...e };
    if (el.bind && card[el.bind] != null) el.text = el.transform === 'upper' ? String(card[el.bind]).toUpperCase() : String(card[el.bind]);
    if (el.color) el.color = live(el.colorTheme, el.color, el.colorFixed);
    if (el.bg) el.bg = live(el.bgTheme, el.bg, el.bgFixed);
    return el;
  });
  return repairFrameForCard(card, ctx, { background: bg, elements });
}

function sameText(a, b) {
  return norm(String(a || '').replace(/\s+/g, ' ')) === norm(String(b || '').replace(/\s+/g, ' '));
}

function airBodyElement(card, ctx, band) {
  const { W, H, theme } = ctx;
  const pad = Math.round(W * 0.05);
  return {
    id: 'el_air_body_guard',
    type: 'text',
    bind: 'body',
    x: pad,
    y: band.y,
    w: W - pad * 2,
    h: band.h,
    text: String(card.body || '').toUpperCase(),
    font: 'display',
    weight: 800,
    color: theme.accentText,
    colorTheme: 'accentText',
    align: 'center',
    valign: 'center',
    lineHeight: 1,
    autofit: { min: Math.round(H * 0.04), max: Math.round(H * 0.075), lines: 1 },
  };
}

function repairAirFrame(card, ctx, frame) {
  if (!String(card.body || '').trim()) return frame;
  const { W, H, theme } = ctx;
  const elements = Array.isArray(frame.elements) ? [...frame.elements] : [];
  let band = elements.find((el) =>
    (el.type === 'rect' || el.type === 'band') &&
    Number(el.w || 0) >= W * 0.8 &&
    Number(el.h || 0) >= H * 0.06 &&
    Number(el.y || 0) >= H * 0.45 &&
    Number(el.y || 0) <= H * 0.82
  );
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
    band.color = theme.accent;
    band.colorTheme = 'accent';
    delete band.colorFixed;
  }

  const idx = elements.findIndex((el) =>
    (el.type === 'text' || el.type === 'chip') &&
    (el.bind === 'body' || sameText(el.text, card.body))
  );
  const body = idx >= 0 ? { ...elements[idx], ...airBodyElement(card, ctx, band) } : airBodyElement(card, ctx, band);
  if (idx >= 0) elements.splice(idx, 1);
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

function weatherBandTextElement(card, ctx, band) {
  const { W, H, theme } = ctx;
  const pad = Math.round(W * 0.05);
  return {
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
}

function overlapsY(el, y, h) {
  const top = Number(el.y || 0);
  const bottom = top + Number(el.h || 0);
  return bottom > y && top < y + h;
}

function repairWeatherFrame(card, ctx, frame) {
  const { W, H, theme } = ctx;
  const elements = Array.isArray(frame.elements) ? [...frame.elements] : [];

  const icon = weatherIconElement(card, ctx);
  const svgIdx = elements.findIndex((el) => el.type === 'svg' && /<svg/i.test(String(el.svg || '')));
  if (svgIdx >= 0) elements[svgIdx] = { ...elements[svgIdx], ...icon };
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
    const bandText = weatherBandTextElement(card, ctx, band);
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      if (el === band || el.type !== 'text') continue;
      const isWeatherText = el.bind === 'weatherSummary' ||
        el.bind === 'subtitle' ||
        el.bind === 'body' ||
        sameText(el.text, card.subtitle) ||
        sameText(el.text, card.body) ||
        sameText(el.text, summary);
      if (isWeatherText || overlapsY(el, Number(band.y || 0), Number(band.h || 0))) elements.splice(i, 1);
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

function repairForecastFrame(card, ctx, frame) {
  const days = forecastDays(card);
  if (!days.length) return frame;
  const elements = (Array.isArray(frame.elements) ? [...frame.elements] : [])
    .filter((el) => el.type !== 'svg' || !/<svg/i.test(String(el.svg || '')));
  days.forEach((day, i) => elements.push(forecastIconElement(day, i, days.length, ctx)));
  return { ...frame, elements };
}

function repairFrameForCard(card, ctx, frame) {
  if (card && card.template === 'aire') return repairAirFrame(card, ctx, frame);
  if (card && card.template === 'clima') return repairWeatherFrame(card, ctx, frame);
  if (card && card.template === 'prevision') return repairForecastFrame(card, ctx, frame);
  return frame;
}

// Frame resuelto, por prioridad: layout propio de la cartela > layout por defecto
// de la plantilla > el que genera la plantilla en código.
function resolveFrame(card, ctx, tpl) {
  if (card.layout && Array.isArray(card.layout.elements)) return applyLayout(card.layout, card, ctx);
  const tl = require('../templateLayouts').get(card.template, ctx.theme && ctx.theme.key);
  if (tl && Array.isArray(tl.elements)) return applyLayout(tl, card, ctx);
  const frame = tpl.build(card, ctx) || { elements: [] };
  frame.elements = (frame.elements || []).map((e, i) => Object.assign({ id: 'el' + i, bind: inferBind(e, card) }, e));
  return repairFrameForCard(card, ctx, frame);
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
