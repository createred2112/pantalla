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

// Se inyecta en la página: crea una coreografía completa (en pausa) y expone
// __setT(ms). No usa azar: el MP4 se renderiza igual en cada ejecución.
function setupAnim(durMs, motion) {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const accent = motion.accent || '#D6FF00';
  const text = motion.text || '#FFFFFF';
  const template = document.body.dataset.template || '';
  const easeOut = 'cubic-bezier(.16,.86,.28,1)';
  const easeHard = 'cubic-bezier(.13,.92,.18,1)';
  const animations = [];

  document.documentElement.style.background = '#000';
  document.body.style.transformOrigin = '50% 50%';

  function add(el, frames, opts) {
    const a = el.animate(frames, Object.assign({ fill: 'both' }, opts));
    a.pause();
    animations.push(a);
    return a;
  }

  function overlay(cls, css) {
    const el = document.createElement('div');
    el.className = cls;
    el.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:999;' + css;
    document.body.appendChild(el);
    return el;
  }

  const sweep = overlay('motion-sweep', `background:${accent};mix-blend-mode:screen;opacity:.22;transform:translateX(-130%) skewX(-14deg);`);
  add(sweep, [
    { transform: 'translateX(-130%) skewX(-14deg)', opacity: 0 },
    { transform: 'translateX(-40%) skewX(-14deg)', opacity: .28, offset: .25 },
    { transform: 'translateX(130%) skewX(-14deg)', opacity: 0 },
  ], { duration: 1050, delay: 120, easing: easeHard });

  const flash = overlay('motion-flash', `background:${text};opacity:0;`);
  add(flash, [
    { opacity: 0 },
    { opacity: .16, offset: .2 },
    { opacity: 0 },
  ], { duration: 340, delay: 120, easing: 'ease-out' });

  const shade = overlay('motion-shade', 'background:radial-gradient(circle at 20% 10%, rgba(255,255,255,.18), transparent 28%), linear-gradient(115deg, transparent 0%, rgba(255,255,255,.10) 45%, transparent 72%);opacity:0;');
  add(shade, [
    { opacity: 0, transform: 'translateX(-8%)' },
    { opacity: .5, transform: 'translateX(3%)', offset: .35 },
    { opacity: .16, transform: 'translateX(8%)' },
  ], { duration: durMs, easing: 'ease-in-out' });

  const bg = document.querySelector('#bgimg');
  if (bg) {
    bg.style.transformOrigin = template === 'foto' ? '45% 45%' : '50% 50%';
    add(bg, [
      { transform: 'scale(1.025) translate3d(-1.2%, .4%, 0)', filter: 'brightness(.92)' },
      { transform: 'scale(1.13) translate3d(1.8%, -1.4%, 0)', filter: 'brightness(.98)' },
    ], { duration: durMs, easing: 'ease-in-out' });
  } else {
    add(document.body, [
      { filter: 'brightness(.92) saturate(1.05)' },
      { filter: 'brightness(1.05) saturate(1.16)', offset: .18 },
      { filter: 'brightness(1) saturate(1.08)' },
    ], { duration: Math.min(durMs, 2600), easing: 'ease-out' });
  }

  const els = [].slice.call(document.querySelectorAll('.el'));
  const textEls = els.filter((el) => el.dataset.kind === 'text');
  const hero = textEls.reduce((best, el) => {
    const r = el.getBoundingClientRect();
    const area = r.width * r.height;
    return !best || area > best.area ? { el, area } : best;
  }, null);

  els.forEach((el, i) => {
    const kind = el.dataset.kind || 'item';
    const rect = el.getBoundingClientRect();
    const isHero = hero && hero.el === el;
    const fromLeft = rect.left < W * .52;
    const delay = isHero ? 380 : 170 + i * 95;
    el.style.willChange = 'transform, opacity, clip-path, filter';
    el.style.transformOrigin = fromLeft ? '0% 50%' : '100% 50%';

    if (kind === 'rect' || kind === 'band') {
      add(el, [
        { opacity: 0, transform: fromLeft ? 'scaleX(0)' : 'scaleY(0)' },
        { opacity: 1, transform: 'scaleX(1) scaleY(1)' },
      ], { duration: 620, delay: Math.max(0, delay - 160), easing: easeOut });
      return;
    }

    if (kind === 'chip') {
      add(el, [
        { opacity: 0, transform: `translate3d(${fromLeft ? -90 : 90}px,0,0) scale(.84)`, filter: 'blur(6px)' },
        { opacity: 1, transform: 'translate3d(0,0,0) scale(1.08)', filter: 'blur(0)', offset: .72 },
        { opacity: 1, transform: 'translate3d(0,0,0) scale(1)', filter: 'blur(0)' },
      ], { duration: 700, delay, easing: easeHard });
      add(el, [
        { transform: 'translate3d(0,0,0) scale(1)' },
        { transform: 'translate3d(0,0,0) scale(1.045)', offset: .5 },
        { transform: 'translate3d(0,0,0) scale(1)' },
      ], { duration: 1300, delay: delay + 950, iterations: Math.max(1, Math.floor(durMs / 1500)), easing: 'ease-in-out' });
      return;
    }

    if (kind === 'text' && isHero) {
      add(el, [
        { opacity: 0, clipPath: 'inset(0 100% 0 0)', transform: 'translate3d(-70px,0,0) scale(.98)', filter: 'blur(8px)' },
        { opacity: 1, clipPath: 'inset(0 0 0 0)', transform: 'translate3d(10px,0,0) scale(1.015)', filter: 'blur(0)', offset: .76 },
        { opacity: 1, clipPath: 'inset(0 0 0 0)', transform: 'translate3d(0,0,0) scale(1)', filter: 'blur(0)' },
      ], { duration: 980, delay, easing: easeHard });
      add(el, [
        { transform: 'translate3d(0,0,0) scale(1)' },
        { transform: 'translate3d(8px,-3px,0) scale(1.012)', offset: .5 },
        { transform: 'translate3d(0,0,0) scale(1)' },
      ], { duration: Math.max(2400, durMs - delay - 500), delay: delay + 980, easing: 'ease-in-out' });
      return;
    }

    if (kind === 'text') {
      add(el, [
        { opacity: 0, transform: `translate3d(${fromLeft ? -55 : 55}px,26px,0)`, filter: 'blur(5px)' },
        { opacity: 1, transform: 'translate3d(0,0,0)', filter: 'blur(0)' },
      ], { duration: 760, delay, easing: easeOut });
      add(el, [
        { transform: 'translate3d(0,0,0)' },
        { transform: 'translate3d(0,-4px,0)', offset: .5 },
        { transform: 'translate3d(0,0,0)' },
      ], { duration: 2600, delay: delay + 900, easing: 'ease-in-out' });
      return;
    }

    add(el, [
      { opacity: 0, transform: 'translate3d(0,34px,0) scale(.96)', filter: 'blur(4px)' },
      { opacity: 1, transform: 'translate3d(0,0,0) scale(1)', filter: 'blur(0)' },
    ], { duration: 740, delay, easing: easeOut });
  });

  const exitStart = Math.max(1200, durMs - 650);
  add(document.body, [
    { opacity: 1, transform: 'scale(1)', filter: 'brightness(1)' },
    { opacity: 1, transform: 'scale(1.012)', filter: 'brightness(1.08)', offset: .55 },
    { opacity: 0, transform: 'scale(1.025)', filter: 'brightness(.85)' },
  ], { duration: 650, delay: exitStart, easing: 'ease-in' });

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
    await page.evaluate(setupAnim, duration * 1000, {
      accent: ctx.theme.accent,
      text: ctx.theme.text,
      bg: ctx.theme.bg,
    });
    for (let i = 0; i < frames; i++) {
      await page.evaluate((ms) => window.__setT(ms), (i / fps) * 1000);
      await page.screenshot({ path: path.join(dir, 'f' + String(i).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 92, clip: { x: 0, y: 0, width: W, height: H } });
    }
    fs.mkdirSync(paths.output, { recursive: true });
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
