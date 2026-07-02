'use strict';
// Motor de vídeo (F4a): renderiza una cartela animada a MP4 capturando fotogramas
// con Chromium (animaciones por Web Animations API, deterministas) y codificando
// con ffmpeg. Animación por código: entrada escalonada de elementos + Ken Burns.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const { cfg, paths, abs } = require('../config');
const { buildHtml, withPage, AUTOFIT } = require('./htmlRender');
const { prepare } = require('./renderCard');
const renderGuard = require('../util/renderGuard');

// Se inyecta en la página: crea una coreografía completa (en pausa) y expone
// __setT(ms). No usa azar: el MP4 se renderiza igual en cada ejecución.
// Estilo BROADCAST (informativos): cortina de color que descubre la cartela,
// textos revelados por una barra de acento que los recorre, todo entra en la
// misma dirección con easing duro y seco, y cierre con cortina para encadenar.
function setupAnim(durMs, motion) {
  const W = window.innerWidth;
  const accent = motion.accent || '#D6FF00';
  const easeExpo = 'cubic-bezier(.16,1,.3,1)';  // sale disparado, aterriza clavado
  const easeSnap = 'cubic-bezier(.7,0,.2,1)';   // planos: duro y seco
  const animations = [];

  document.documentElement.style.background = '#000';

  function add(el, frames, opts) {
    const a = el.animate(frames, Object.assign({ fill: 'both' }, opts));
    a.pause();
    animations.push(a);
    return a;
  }

  function overlay(css) {
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;pointer-events:none;' + css;
    document.body.appendChild(el);
    return el;
  }

  // ===== 1) CORTINA DE APERTURA. Dos idents que alternan de forma
  // determinista por cartela: barrido lateral o telón vertical.
  const OPEN_MS = 600;
  const variant = (motion.seed || 0) % 2; // 0: lateral · 1: telón
  const plane = overlay(`inset:0;background:${accent};z-index:999;`);
  add(plane, variant === 0
    ? [{ transform: 'translateX(0)' }, { transform: 'translateX(102%)' }]
    : [{ transform: 'translateY(0)' }, { transform: 'translateY(-102%)' }],
    { duration: OPEN_MS, delay: 60, easing: easeSnap });

  // ===== 2) Fondo foto: Ken Burns lento (los fondos planos, quietos).
  const bg = document.querySelector('#bgimg');
  if (bg) {
    bg.style.transformOrigin = '50% 45%';
    add(bg, [
      { transform: 'scale(1.0)' },
      { transform: 'scale(1.055)' },
    ], { duration: durMs, easing: 'linear' });
  }

  // Revelado con BARRA VIAJERA: el texto se descubre de izquierda a derecha
  // mientras una barra de acento recorre su borde (el gesto de los rótulos
  // de informativo). La barra se mide sobre el layout ya autoajustado.
  function barReveal(el, delay, dur) {
    add(el, [
      { clipPath: 'inset(-4% 100% -4% -1%)' },
      { clipPath: 'inset(-4% -2% -4% -1%)' },
    ], { duration: dur, delay, easing: easeExpo });
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return;
    const bw = Math.max(6, Math.round(W * 0.006));
    const bar = overlay(`left:${Math.round(r.left - bw)}px;top:${Math.round(r.top - r.height * 0.04)}px;` +
      `width:${bw}px;height:${Math.round(r.height * 1.08)}px;background:${accent};z-index:998;opacity:0;`);
    add(bar, [
      { transform: 'translateX(0)', opacity: 1 },
      { transform: `translateX(${Math.round(r.width + bw * 2)}px)`, opacity: 1, offset: .88 },
      { transform: `translateX(${Math.round(r.width + bw * 2)}px)`, opacity: 0 },
    ], { duration: dur + 140, delay, easing: easeExpo });
  }

  // ===== 3) Contenido: TODO entra de izquierda a derecha, escalonado y seco.
  const els = [].slice.call(document.querySelectorAll('.el'));
  const textEls = els.filter((el) => el.dataset.kind === 'text');
  const hero = textEls.reduce((best, el) => {
    const r = el.getBoundingClientRect();
    const area = r.width * r.height;
    return !best || area > best.area ? { el, area } : best;
  }, null);

  const T0 = OPEN_MS - 140; // el contenido pisa el final de la cortina
  let order = 0;
  els.forEach((el) => {
    const kind = el.dataset.kind || 'item';
    const isHero = hero && hero.el === el;
    const delay = T0 + order * 90;
    order++;
    el.style.willChange = 'transform, opacity, clip-path';

    // Bandas/planos de color: entran deslizando desde la izquierda.
    if (kind === 'rect' || kind === 'band') {
      add(el, [
        { transform: 'translateX(-103%)' },
        { transform: 'translateX(0)' },
      ], { duration: 520, delay: Math.max(T0 - 80, delay - 120), easing: easeExpo });
      return;
    }

    // Chips y titular: revelado con barra viajera (el hero, más lento y regio).
    if (kind === 'chip' || (kind === 'text' && isHero)) {
      barReveal(el, delay, isHero ? 680 : 480);
      return;
    }

    // Resto (textos secundarios, logo, svg): revelado seco sin barra.
    if (kind === 'text' || kind === 'svg') {
      add(el, [
        { clipPath: 'inset(-4% 100% -4% -1%)' },
        { clipPath: 'inset(-4% -2% -4% -1%)' },
      ], { duration: 460, delay, easing: easeExpo });
      return;
    }
    add(el, [
      { opacity: 0, transform: 'translateX(-24px)' },
      { opacity: 1, transform: 'translateX(0)' },
    ], { duration: 420, delay, easing: easeExpo });
  });

  // Vida continua: los elementos marcados con data-anim="float" (p. ej. el
  // icono del tiempo) flotan suavemente mientras la cartela está en reposo.
  els.filter((el) => el.dataset.anim === 'float').forEach((el) => {
    add(el, [
      { transform: 'translateY(-1.6%) rotate(-1.5deg)' },
      { transform: 'translateY(1.6%) rotate(1.5deg)' },
    ], { duration: 2600, delay: T0 + 500, iterations: Math.max(1, Math.ceil(durMs / 2600)), direction: 'alternate', easing: 'ease-in-out' });
  });
  // El sol gira despacio, sin parar: vida constante sin marear.
  els.filter((el) => el.dataset.anim === 'spin').forEach((el) => {
    add(el, [
      { transform: 'rotate(0deg)' },
      { transform: 'rotate(360deg)' },
    ], { duration: 36000, delay: 0, iterations: Math.max(1, Math.ceil(durMs / 36000)), easing: 'linear' });
  });

  // ===== 4) CORTINA DE CIERRE: entra desde la izquierda cubriendo la cartela.
  // La siguiente abre cubierta en acento -> el bucle encadena sin costuras.
  const CLOSE_MS = 460;
  const closePlane = overlay(`inset:0;background:${accent};z-index:1000;transform:${variant === 0 ? 'translateX(-102%)' : 'translateY(102%)'};`);
  add(closePlane, variant === 0
    ? [{ transform: 'translateX(-102%)' }, { transform: 'translateX(0)' }]
    : [{ transform: 'translateY(102%)' }, { transform: 'translateY(0)' }],
    { duration: CLOSE_MS, delay: Math.max(OPEN_MS + 400, durMs - CLOSE_MS), easing: easeSnap });

  // ===== 5) MARQUESINA LED: los textos que no cupieron (elipsis en estático)
  // se desplazan en vídeo como un rótulo luminoso, de un extremo al otro.
  [].slice.call(document.querySelectorAll('[data-overflow="1"]')).forEach((el) => {
    el.style.display = 'inline-block';
    el.style.webkitLineClamp = '';
    el.style.webkitBoxOrient = '';
    el.style.whiteSpace = 'nowrap';
    el.style.overflow = 'visible';
    const travel = el.scrollWidth - el.parentElement.clientWidth;
    if (travel < 20) return;
    const t0 = OPEN_MS + 700;
    const span = Math.max(1500, durMs - CLOSE_MS - 300 - t0);
    add(el, [
      { transform: 'translateX(0)' },
      { transform: `translateX(-${travel}px)` },
    ], { duration: span, delay: t0, direction: 'alternate', iterations: 1, easing: 'ease-in-out' });
  });

  window.__setT = function (ms) {
    animations.forEach((a) => {
      try {
        const end = a.effect.getComputedTiming().endTime || (a.effect.getTiming().delay + a.effect.getTiming().duration);
        a.currentTime = Math.max(0, Math.min(ms, end));
      } catch (e) {}
    });
  };
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpeg, args);
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => code === 0 ? resolve() : reject(new Error('ffmpeg ' + code + ': ' + err.slice(-500))));
  });
}

async function encode(dir, fps, out) {
  await runFfmpeg(['-y', '-framerate', String(fps), '-i', path.join(dir, 'f%05d.jpg'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-movflags', '+faststart', out]);
  return out;
}

function concatLine(file) {
  return `file '${file.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`;
}

async function normalizeClip(input, out, W, H, fps) {
  await runFfmpeg([
    '-y', '-i', input, '-an',
    '-vf', `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${fps},format=yuv420p`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-movflags', '+faststart',
    out,
  ]);
  return out;
}

async function stitchClips(inputs, out, dir, W, H, fps) {
  if (inputs.length === 1) {
    fs.copyFileSync(inputs[0], out);
    return out;
  }
  const normalized = [];
  for (let i = 0; i < inputs.length; i++) {
    const n = path.join(dir, `seg${String(i).padStart(2, '0')}.mp4`);
    await normalizeClip(inputs[i], n, W, H, fps);
    normalized.push(n);
  }
  const list = path.join(dir, 'concat.txt');
  fs.writeFileSync(list, normalized.map(concatLine).join('\n'));
  await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', out]);
  return out;
}

function bumperPath(card, field, label) {
  if (!card[field]) return null;
  const p = abs(card[field]);
  if (!fs.existsSync(p)) throw new Error(`cortinilla ${label} no encontrada: ${card[field]}`);
  return p;
}

// Renderiza la cartela a un MP4 en output/. Devuelve { file, ext:'mp4' }.
async function renderVideoToFile(card) {
  renderGuard.assertCanUseChrome('video');
  const prep = prepare(card);
  if (!prep) throw new Error('plantilla no animable');
  const { ctx, tpl, frame } = prep;
  const { W, H } = ctx;
  const duration = Math.max(2, Math.min(20, Number(card.duration) || 6));
  const fps = card._previewVideo ? Math.min(12, Number(cfg.video && cfg.video.fps) || 25) : (Number(cfg.video && cfg.video.fps) || 25);
  const frames = Math.round(duration * fps);

  const html = await buildHtml(card, ctx, tpl, frame);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pantalla-vid-'));
  try {
    return await withPage(async (page) => {
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load' });
    try { await page.evaluate('document.fonts.ready'); } catch {}
    await page.evaluate(AUTOFIT);
    let seed = 0;
    for (const ch of String(card.id || '')) seed = (seed + ch.charCodeAt(0)) % 997;
    await page.evaluate(setupAnim, duration * 1000, {
      accent: ctx.theme.accent,
      text: ctx.theme.text,
      bg: ctx.theme.bg,
      seed,
    });
    for (let i = 0; i < frames; i++) {
      await page.evaluate((ms) => window.__setT(ms), (i / fps) * 1000);
      await page.screenshot({ path: path.join(dir, 'f' + String(i).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 92, clip: { x: 0, y: 0, width: W, height: H } });
    }
    fs.mkdirSync(paths.output, { recursive: true });
    const posterFrame = Math.min(frames - 1, Math.max(0, Math.round(fps * Math.min(1.2, duration * 0.35))));
    const posterSrc = path.join(dir, 'f' + String(posterFrame).padStart(5, '0') + '.jpg');
    if (!card._previewVideo && fs.existsSync(posterSrc)) {
      fs.copyFileSync(posterSrc, path.join(paths.output, card.id + '.jpg'));
    }
    const out = path.join(paths.output, card.id + '.mp4');
    const main = path.join(dir, 'main.mp4');
    await encode(dir, fps, main);
    const intro = bumperPath(card, 'videoIntro', 'de entrada');
    const outro = bumperPath(card, 'videoOutro', 'de salida');
    await stitchClips([intro, main, outro].filter(Boolean), out, dir, W, H, fps);
    return { file: out, ext: 'mp4' };
    });
  } finally {
    try { for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f)); fs.rmdirSync(dir); } catch {}
  }
}

module.exports = { renderVideoToFile };
