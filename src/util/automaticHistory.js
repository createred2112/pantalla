'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const { paths } = require('../config');
const status = require('./status');
const log = require('./logger');

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function run(args, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, args, { windowsHide: true });
    let error = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill('SIGKILL'); } catch {}
      reject(new Error('El histórico automático tardó demasiado.'));
    }, timeoutMs);
    child.stderr.on('data', (chunk) => { error += chunk; });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}: ${error.slice(-700)}`));
    });
  });
}

async function create(files, source) {
  const names = (files || []).map((file) => path.basename(String(file))).filter(Boolean);
  const inputs = names.map((name) => path.join(paths.publish, name)).filter((file) => fs.existsSync(file));
  if (!inputs.length) throw new Error('No hay archivos publicados para guardar en el histórico.');
  const historyDir = path.join(paths.output, 'history');
  fs.mkdirSync(historyDir, { recursive: true });
  const name = `auto-${stamp()}-240p.mp4`;
  const out = path.join(historyDir, name);
  status.set('history', { ok: null, running: true, source, count: inputs.length, file: name });
  const args = ['-y'];
  inputs.forEach((input) => args.push('-i', input));
  const filters = inputs.map((_, i) =>
    `[${i}:v]scale=240:136:force_original_aspect_ratio=decrease,pad=240:136:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=10,format=yuv420p[v${i}]`
  );
  filters.push(inputs.map((_, i) => `[v${i}]`).join('') + `concat=n=${inputs.length}:v=1:a=0[v]`);
  args.push('-filter_complex', filters.join(';'), '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '31', '-movflags', '+faststart', out);
  await run(args);
  const result = { ok: true, running: false, source, count: inputs.length, file: name, url: `/media/output/history/${encodeURIComponent(name)}`, size: fs.statSync(out).size };
  status.set('history', result);
  log.info('history', `Histórico automático guardado: ${name}`);
  return result;
}

module.exports = { create };
