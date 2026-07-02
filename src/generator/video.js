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
// Estilo: editorial y sobrio. Entradas escalonadas limpias (fade + leve
// subida), titular con revelado horizontal, Ken Burns muy sutil en la foto y
// fundido de salida. Nada de barridos, destellos, blur ni rebotes.
function setupAnim(durMs, motion) {
  const easeOut = 'cubic-bezier(.22,.61,.36,1)';
  const animations = [];

  document.documentElement.style.background = '#000';

  function add(el, frames, opts) {
    const a = el.animate(frames, Object.assign({ fill: 'both' }, opts));
    a.pause();
    animations.push(a);
    return a;
  }

  // Fondo: Ken Burns lento y contenido SOLO si hay foto. Los fondos planos se
  // quedan quietos: el color es parte del diseño, no hace falta moverlo.
  const bg = document.querySelector('#bgimg');
  if (bg) {
    bg.style.transformOrigin = '50% 45%';
    add(bg, [
      { transform: 'scale(1.0)' },
      { transform: 'scale(1.055)' },
    ], { duration: durMs, easing: 'linear' });
  }

  const els = [].slice.call(document.querySelectorAll('.el'));
  const textEls = els.filter((el) => el.dataset.kind === 'text');
  const hero = textEls.reduce((best, el) => {
    const r = el.getBoundingClientRect();
    const area = r.width * r.height;
    return !best || area > best.area ? { el, area } : best;
  }, null);

  let order = 0;
  els.forEach((el) => {
    const kind = el.dataset.kind || 'item';
    const isHero = hero && hero.el === el;
    const delay = 160 + order * 110;
    order++;
    el.style.willChange = 'transform, opacity, clip-path';

    // Bandas y rectángulos: crecen desde su borde izquierdo, por delante del texto.
    if (kind === 'rect' || kind === 'band') {
      el.style.transformOrigin = '0% 50%';
      add(el, [
        { opacity: 0, transform: 'scaleX(.001)' },
        { opacity: 1, transform: 'scaleX(1)' },
      ], { duration: 500, delay: Math.max(60, delay - 140), easing: easeOut });
      return;
    }

    // Titular protagonista: revelado horizontal limpio.
    if (kind === 'text' && isHero) {
      add(el, [
        { opacity: 0, clipPath: 'inset(0 100% 0 0)', transform: 'translate3d(0,14px,0)' },
        { opacity: 1, clipPath: 'inset(0 -2% 0 0)', transform: 'translate3d(0,0,0)' },
      ], { duration: 700, delay, easing: easeOut });
      return;
    }

    // Todo lo demás (textos, chips, logo): fade + subida leve, escalonado.
    add(el, [
      { opacity: 0, transform: 'translate3d(0,18px,0)' },
      { opacity: 1, transform: 'translate3d(0,0,0)' },
    ], { duration: 540, delay, easing: easeOut });
  });

  // Salida: fundido corto para encadenar con la siguiente cartela sin golpe.
  const exitStart = Math.max(1000, durMs - 450);
  add(document.body, [
    { opacity: 1 },
    { opacity: 0 },
  ], { duration: 450, delay: exitStart, easing: 'ease-in' });

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
