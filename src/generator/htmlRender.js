'use strict';
// Motor de render HTML/Chromium (Puppeteer). Una plantilla "nueva" exporta
// build(card, ctx) -> Frame { background, elements:[...] } y este módulo la
// convierte en HTML, la mide/auto-ajusta en un navegador headless y captura JPG.
// Es la base del editor visual (F2) y de las animaciones (F4).
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { cfg, abs } = require('../config');

let _browser = null;
let _fontCss = null;

async function browser() {
  if (_browser && _browser.connected) return _browser;
  const puppeteer = require('puppeteer');
  _browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--force-color-profile=srgb', '--font-render-hinting=none'],
  });
  return _browser;
}

// @font-face con las fuentes empaquetadas (base64, sin depender de origen).
function fontFaceCss() {
  if (_fontCss != null) return _fontCss;
  const dir = abs('assets/fonts');
  let css = '';
  try {
    for (const f of fs.readdirSync(dir)) {
      const m = f.match(/^([A-Za-z0-9]+)-(\d+)\.(ttf|otf)$/i);
      if (!m) continue;
      const otf = m[3].toLowerCase() === 'otf';
      const b64 = fs.readFileSync(path.join(dir, f)).toString('base64');
      css += `@font-face{font-family:'${m[1]}';font-weight:${m[2]};font-style:normal;src:url(data:font/${otf ? 'otf' : 'ttf'};base64,${b64}) format('${otf ? 'opentype' : 'truetype'}');}\n`;
    }
  } catch {}
  _fontCss = css;
  return css;
}
function invalidateFonts() { _fontCss = null; }

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function famOf(font) {
  return font === 'display' ? (cfg.brand.fontDisplay || 'sans-serif') : (cfg.brand.fontFamily || 'sans-serif');
}

// Imagen (foto/logo) recortada al tamaño del elemento y embebida en base64.
async function imgDataUri(srcPath, w, h, fit) {
  try {
    const ap = abs(srcPath);
    if (!fs.existsSync(ap)) return null;
    const buf = await sharp(ap).resize(Math.round(w), Math.round(h), { fit: fit || 'cover', position: 'attention' }).jpeg({ quality: 86 }).toBuffer();
    return 'data:image/jpeg;base64,' + buf.toString('base64');
  } catch { return null; }
}
function logoUri(p) {
  try {
    if (!p) return null;
    const ap = abs(p); if (!fs.existsSync(ap)) return null;
    const ext = path.extname(ap).slice(1).toLowerCase() || 'png';
    return `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,` + fs.readFileSync(ap).toString('base64');
  } catch { return null; }
}

// Convierte un elemento del esquema en HTML.
async function elHtml(el, ctx) {
  const { W, H } = ctx;
  const scale = Number(cfg.brand.textScale) || 1;
  const attrs = `class="el el-${el.type || 'item'}" data-kind="${el.type || 'item'}"`;
  const box = `position:absolute;left:${el.x}px;top:${el.y}px;width:${el.w}px;height:${el.h}px;overflow:hidden;`;

  if (el.type === 'rect' || el.type === 'band') {
    return `<div ${attrs} style="${box}background:${el.gradient || el.color || '#000'};border-radius:${el.radius || 0}px;"></div>`;
  }
  if (el.type === 'image') {
    const uri = await imgDataUri(el.src, el.w, el.h, el.fit);
    if (!uri) return '';
    return `<div ${attrs} style="${box}"><img src="${uri}" style="width:100%;height:100%;object-fit:${el.fit || 'cover'};display:block"/></div>`;
  }
  if (el.type === 'text') {
    const fam = famOf(el.font);
    const align = el.align || 'left';
    const valign = el.valign === 'center' ? 'center' : el.valign === 'bottom' ? 'flex-end' : 'flex-start';
    const just = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';
    const ls = el.letterSpacingEm ? `letter-spacing:${el.letterSpacingEm}em;` : '';
    const tt = el.transform === 'upper' ? 'text-transform:uppercase;' : '';
    const lh = el.lineHeight || 1.05;
    const nowrap = (el.autofit && el.autofit.lines === 1) ? 'white-space:nowrap;' : 'white-space:pre-wrap;word-break:break-word;';
    const fit = el.autofit
      ? `data-fit="1" data-min="${Math.round(el.autofit.min * scale)}" data-max="${Math.round(el.autofit.max * scale)}"`
      : '';
    const size = el.autofit ? Math.round(el.autofit.max * scale) : Math.round((el.size || 40) * scale);
    return `<div ${attrs} style="${box}display:flex;justify-content:${just};align-items:${valign};text-align:${align};">` +
      `<div ${fit} style="font-family:${fam};font-weight:${el.weight || 700};font-size:${size}px;line-height:${lh};color:${el.color || '#fff'};${ls}${tt}${nowrap}max-width:100%;">${esc(el.text)}</div></div>`;
  }
  if (el.type === 'chip') {
    const fam = famOf(el.font || 'text');
    const cs = Math.round((el.size || 30) * scale);
    // Ancho automático: posición por esquina sup-izq, sin caja fija.
    return `<div ${attrs} style="position:absolute;left:${el.x}px;top:${el.y}px;display:inline-flex;align-items:center;` +
      `background:${el.bg};color:${el.color};font-family:${fam};font-weight:700;font-size:${cs}px;` +
      `letter-spacing:${el.letterSpacing != null ? el.letterSpacing : 2}px;height:${Math.round(cs * 1.9)}px;padding:0 ${Math.round(cs * 0.6)}px;` +
      `border-radius:${el.radius != null ? el.radius : Math.round(cs * 0.35)}px;text-transform:uppercase;white-space:nowrap;">${esc(el.text)}</div>`;
  }
  if (el.type === 'svg') {
    return `<div ${attrs} style="${box}">${el.svg}</div>`;
  }
  return '';
}

// Logo real como elemento posicionado en una esquina. Si no hay imagen cargada,
// mejor sin marca que una marca falsa.
async function logoHtml(ctx, tpl) {
  if (tpl.logo === false) return '';
  const { W, H, theme } = ctx;
  const pos = tpl.logoPos || 'bl';
  const onDark = ctx._onDark;
  const mx = Math.round(W * 0.045), my = Math.round(H * 0.05);
  const corner = `position:absolute;${pos.includes('r') ? `right:${mx}px;` : `left:${mx}px;`}${pos.includes('t') ? `top:${my}px;` : `bottom:${my}px;`}`;
  const useImg = cfg.brand.logoMode !== 'none';
  const chosen = onDark ? (cfg.brand.logoLight || cfg.brand.logo) : (cfg.brand.logoDark || cfg.brand.logo);
  if (useImg && chosen) {
    const uri = logoUri(chosen);
    if (uri) { const hh = Math.round(H * ((Number(cfg.brand.logoWidth) || 9) / 100)); return `<img class="el el-logo" data-kind="logo" src="${uri}" style="${corner}height:${hh}px;width:auto;"/>`; }
  }
  return '';
}

// Script de auto-ajuste: agranda cada [data-fit] hasta llenar su caja.
const AUTOFIT = `
(function(){
  document.querySelectorAll('[data-fit]').forEach(function(el){
    var lo=+el.dataset.min, hi=+el.dataset.max, best=lo;
    while(lo<=hi){ var mid=(lo+hi)>>1; el.style.fontSize=mid+'px';
      if(el.scrollWidth<=el.parentElement.clientWidth && el.scrollHeight<=el.parentElement.clientHeight){best=mid;lo=mid+1;} else {hi=mid-1;} }
    el.style.fontSize=best+'px';
  });
})();`;

// Construye el HTML completo de un frame (fondo + elementos + logo + fuentes).
async function buildHtml(card, ctx, tpl, frame, opts = {}) {
  const { W, H } = ctx;
  if (!frame) frame = tpl.build(card, ctx);
  const bg = frame.background || { type: 'solid', color: ctx.theme.bg };

  let bgHtml = '';
  let bodyBg = '#000';
  if (bg.type === 'photo' && card.photo) {
    const uri = await imgDataUri(card.photo, W, H, 'cover');
    if (uri) bgHtml = `<img id="bgimg" src="${uri}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"/>`;
    else bodyBg = bg.color || ctx.theme.bg;
  } else {
    bodyBg = bg.color || ctx.theme.bg;
  }

  const parts = [];
  for (const el of (frame.elements || [])) parts.push(await elHtml(el, ctx));
  parts.push(await logoHtml(ctx, tpl));

  return `<!doctype html><html><head><meta charset="utf-8"><style>` +
    fontFaceCss() +
    `*{margin:0;padding:0;box-sizing:border-box}html,body{width:${W}px;height:${H}px;overflow:hidden}` +
    `body{background:${bodyBg};position:relative}</style></head><body data-template="${tpl.id || ''}">` +
    bgHtml + parts.join('') +
    `<script>${AUTOFIT}</script></body></html>`;
}

async function renderFrame(card, ctx, tpl, frame) {
  const { W, H } = ctx;
  const html = await buildHtml(card, ctx, tpl, frame);
  const b = await browser();
  const page = await b.newPage();
  try {
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load' });
    try { await page.evaluate('document.fonts.ready'); } catch {}
    await page.evaluate(AUTOFIT);
    const ext = (cfg.screen.format || 'jpg').toLowerCase();
    const buffer = await page.screenshot({ type: ext === 'png' ? 'png' : 'jpeg', quality: ext === 'png' ? undefined : (cfg.screen.quality || 90), clip: { x: 0, y: 0, width: W, height: H } });
    return { buffer, ext: ext === 'jpeg' ? 'jpg' : ext };
  } finally {
    await page.close();
  }
}

async function close() { if (_browser) { try { await _browser.close(); } catch {} _browser = null; } }

module.exports = { renderFrame, buildHtml, browser, AUTOFIT, close, invalidateFonts };
