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

// Wordmark "GasteizBerri" en SVG, según colores del tema. Sobre foto va siempre
// en blanco + acento lima. Posición configurable (por defecto abajo-izquierda).
function buildWordmark(W, H, theme, hasPhoto, pos) {
  const wm = cfg.brand.wordmark;
  if (!wm) return null;
  const esc = templates.lib.escapeXml;
  const size = Math.round(H * 0.044);
  const m = Math.round(W * 0.045);
  const a = wm.a, b = wm.b;
  const textCol = hasPhoto ? '#FFFFFF' : theme.text;
  const accentCol = hasPhoto ? '#D6FF00' : (theme.logoAccent || theme.accent);
  const aw = templates.lib.estimateWidth(a, size, 800);
  const total = aw + templates.lib.estimateWidth(b, size, 800);
  const x = pos.includes('r') ? W - m - total : m;
  const y = pos.includes('t') ? Math.round(H * 0.06) + size : H - m;
  return Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <text x="${x}" y="${y}" font-family="${cfg.brand.fontFamily}" font-size="${size}" font-weight="800" fill="${textCol}">${esc(a)}</text>
      <text x="${Math.round(x + aw)}" y="${y}" font-family="${cfg.brand.fontFamily}" font-size="${size}" font-weight="800" fill="${accentCol}">${esc(b)}</text>
    </svg>`
  );
}

// Contexto de render (tema, fuentes, logo, foto) compartido por render y editor.
function buildCtx(card, tpl) {
  const W = cfg.screen.width, H = cfg.screen.height;
  const useImg = cfg.brand.logoMode !== 'wordmark';
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

// Aplica un layout (elementos) a los datos de la cartela (refresca texto vinculado).
function applyLayout(layout, card) {
  const elements = (layout.elements || []).map((e) => {
    const el = { ...e };
    if (el.bind && card[el.bind] != null) el.text = el.transform === 'upper' ? String(card[el.bind]).toUpperCase() : String(card[el.bind]);
    return el;
  });
  return { background: layout.background, elements };
}

// Frame resuelto, por prioridad: layout propio de la cartela > layout por defecto
// de la plantilla > el que genera la plantilla en código.
function resolveFrame(card, ctx, tpl) {
  if (card.layout && Array.isArray(card.layout.elements)) return applyLayout(card.layout, card);
  const tl = require('../templateLayouts').get(card.template);
  if (tl && Array.isArray(tl.elements)) return applyLayout(tl, card);
  const frame = tpl.build(card, ctx) || { elements: [] };
  frame.elements = (frame.elements || []).map((e, i) => Object.assign({ id: 'el' + i, bind: inferBind(e, card) }, e));
  return frame;
}

// Resuelve el frame para el editor (sin renderizar): { W, H, background, elements }.
function resolveForEditor(card) {
  const tpl = templates.get(card.template);
  if (typeof tpl.build !== 'function') return null;
  const ctx = buildCtx(card, tpl);
  const frame = resolveFrame(card, ctx, tpl);
  return { W: ctx.W, H: ctx.H, template: tpl.id, photo: card.photo || null, fontDisplay: ctx.fontDisplay, fontText: ctx.font, background: frame.background || { type: 'solid', color: ctx.theme.bg }, elements: frame.elements };
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

  // Marca: imagen (logo subido) o wordmark de texto. Posición por plantilla.
  if (tpl.logo !== false) {
    const pos = tpl.logoPos || 'bl';
    const darkBg = hasPhoto || String(ctx.theme.text).toLowerCase() === '#ffffff';
    // Elige logo claro (fondos oscuros) u oscuro (fondos claros); fallback al que haya.
    const chosen = darkBg ? (cfg.brand.logoLight || cfg.brand.logo) : (cfg.brand.logoDark || cfg.brand.logo);
    const logoPath = (cfg.brand.logoMode !== 'wordmark' && chosen) ? abs(chosen) : null;

    if (logoPath && fs.existsSync(logoPath)) {
      // Tamaño por ALTO (cabe en la franja del wordmark), con tope de ancho.
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
    } else {
      const wm = buildWordmark(W, H, ctx.theme, hasPhoto, pos);
      if (wm) layers.push({ input: wm });
    }
  }

  let pipeline = sharp(baseBuf).composite(layers);
  const ext = (cfg.screen.format || 'jpg').toLowerCase();
  if (ext === 'png') pipeline = pipeline.png();
  else pipeline = pipeline.jpeg({ quality: cfg.screen.quality || 88, mozjpeg: true });

  const buffer = await pipeline.toBuffer();
  return { buffer, ext: ext === 'jpeg' ? 'jpg' : ext };
}

async function renderToFile(card) {
  const { buffer, ext } = await renderToBuffer(card);
  fs.mkdirSync(paths.output, { recursive: true });
  const file = path.join(paths.output, `${card.id}.${ext}`);
  fs.writeFileSync(file, buffer);
  return file;
}

module.exports = { renderToBuffer, renderToFile, resolveForEditor };
