'use strict';
// LIMPIEZA AUTOMÁTICA: una vez al día borra de output/ los renders huérfanos
// (de cartelas que ya no existen) con más de 7 días, y restos de staging.
// Conservador a propósito: nunca toca subcarpetas (samples, history,
// qa-template-matrix...), ni publish/, ni la última tanda.
const fs = require('fs');
const path = require('path');
const { paths } = require('../config');
const log = require('./logger');

const MAX_AGE_MS = 7 * 24 * 3600000;

function clean() {
  let removed = 0;
  let freed = 0;
  try {
    const alive = new Set(require('../store').list().map((c) => String(c.id)));
    const now = Date.now();
    for (const f of fs.readdirSync(paths.output)) {
      const full = path.join(paths.output, f);
      let st;
      try { st = fs.statSync(full); } catch { continue; }
      if (!st.isFile()) continue;
      if (f.startsWith('.')) continue; // .render-meta.json y similares
      const id = f.replace(/\.[^.]+$/, '');
      if (alive.has(id)) continue;
      if (now - st.mtimeMs < MAX_AGE_MS) continue;
      try { fs.rmSync(full, { force: true }); removed++; freed += st.size; } catch {}
    }
    // Restos de staging abandonados (cortes de luz, procesos matados...).
    const parent = path.dirname(paths.publish);
    for (const f of fs.readdirSync(parent)) {
      if (!/^\.publish-(staging|backup)-/.test(f)) continue;
      const full = path.join(parent, f);
      try {
        const st = fs.statSync(full);
        if (Date.now() - st.mtimeMs > 24 * 3600000) { fs.rmSync(full, { recursive: true, force: true }); removed++; }
      } catch {}
    }
    if (removed) log.info('janitor', `Limpieza: ${removed} archivo(s) huérfano(s) eliminados (${Math.round(freed / 1024 / 1024)} MB liberados)`);
    return { ok: true, removed, freedMb: Math.round(freed / 1024 / 1024) };
  } catch (e) {
    log.warn('janitor', `Limpieza fallida: ${e.message}`);
    return { ok: false, error: e.message };
  }
}

function start() {
  const t = setInterval(clean, 24 * 3600000);
  if (t.unref) t.unref();
  const first = setTimeout(clean, 5 * 60000);
  if (first.unref) first.unref();
}

module.exports = { clean, start };
