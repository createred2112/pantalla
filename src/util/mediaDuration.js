'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const ffmpeg = require('ffmpeg-static');

const cache = new Map();

function parseDuration(text) {
  const m = String(text || '').match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const seconds = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

function durationSeconds(file) {
  try {
    if (!file || !fs.existsSync(file)) return null;
    const st = fs.statSync(file);
    const key = `${file}:${st.size}:${Math.round(st.mtimeMs)}`;
    if (cache.has(key)) return cache.get(key);
    const r = spawnSync(ffmpeg, ['-hide_banner', '-i', file], { encoding: 'utf8', windowsHide: true });
    const value = parseDuration(`${r.stderr || ''}\n${r.stdout || ''}`);
    cache.set(key, value);
    return value;
  } catch {
    return null;
  }
}

function roundedDuration(file) {
  const n = durationSeconds(file);
  return n == null ? null : Math.round(n * 10) / 10;
}

module.exports = { durationSeconds, roundedDuration };
