'use strict';
// Motor de vídeo (F4a): renderiza una cartela animada a MP4 capturando fotogramas
// con Chromium (animaciones por Web Animations API, deterministas) y codificando
// con ffmpeg. Animación por código: entrada escalonada de elementos + Ken Burns.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const { cfg, paths } = require('../config');
const { buildHtml, browser, AUTOFIT } = require('./htmlRender');
const { prepare } = require('./renderCard');

// Se inyecta en la página: crea las animaciones (en pausa) y expone __setT(ms).
function setupAnim(durMs) {
  const els = [].slice.call(document.querySelectorAll('.el'));
  els.forEach((el, i) => {
    const a = el.animate(
      [{ opacity: 0, transform: 'translateY(40px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: 700, delay: i * 120, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'both' }
    );
    a.pause();
  });
  const bg = document.querySelector('#bgimg');
  if (bg) { const a = bg.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.10)' }], { duration: durMs, easing: 'ease-out', fill: 'both' }); a.pause(); }
  window.__setT = function (ms) { document.getAnimations().forEach((a) => { try { a.currentTime = ms; } catch (e) {} }); };
}

function encode(dir, fps, out) {
  return new Promise((resolve, reject) => {
    const args = ['-y', '-framerate', String(fps), '-i', path.join(dir, 'f%05d.jpg'),
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-movflags', '+faststart', out];
    const p = spawn(ffmpeg, args);
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => code === 0 ? resolve(out) : reject(new Error('ffmpeg ' + code + ': ' + err.slice(-300))));
  });
}

// Renderiza la cartela a un MP4 en output/. Devuelve { file, ext:'mp4' }.
async function renderVideoToFile(card) {
  const prep = prepare(card);
  if (!prep) throw new Error('plantilla no animable');
  const { ctx, tpl, frame } = prep;
  const { W, H } = ctx;
  const duration = Math.max(2, Math.min(20, Number(card.duration) || 6));
  const fps = Number(cfg.video && cfg.video.fps) || 25;
  const frames = Math.round(duration * fps);

  const html = await buildHtml(card, ctx, tpl, frame);
  const b = await browser();
  const page = await b.newPage();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pantalla-vid-'));
  try {
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load' });
    try { await page.evaluate('document.fonts.ready'); } catch {}
    await page.evaluate(AUTOFIT);
    await page.evaluate(setupAnim, duration * 1000);
    for (let i = 0; i < frames; i++) {
      await page.evaluate((ms) => window.__setT(ms), (i / fps) * 1000);
      await page.screenshot({ path: path.join(dir, 'f' + String(i).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 92, clip: { x: 0, y: 0, width: W, height: H } });
    }
    fs.mkdirSync(paths.output, { recursive: true });
    const out = path.join(paths.output, card.id + '.mp4');
    await encode(dir, fps, out);
    return { file: out, ext: 'mp4' };
  } finally {
    await page.close();
    try { for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f)); fs.rmdirSync(dir); } catch {}
  }
}

module.exports = { renderVideoToFile };
