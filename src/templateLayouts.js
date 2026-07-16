'use strict';
// Diseños por defecto a nivel de PLANTILLA + TEMA (afectan a las cartelas de esa
// plantilla y ese esquema de color que no tengan su propio layout).
//
// VERSIONADO: cada versión de diseño (v1/v2) guarda sus predeterminados en un
// archivo propio. Así, al probar el diseño v2 no se pisan los layouts de v1 y
// el rollback es total: data/template-layouts.json (v1) queda intacto.
const fs = require('fs');
const path = require('path');
const { paths, cfg } = require('./config');

function file() {
  const dir = path.dirname(paths.data);
  const v2 = cfg.design && cfg.design.version === 'v2';
  return path.join(dir, v2 ? 'template-layouts.v2.json' : 'template-layouts.json');
}

function load() {
  try { return JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { return {}; }
}
function entryFor(d, id) {
  const rec = d[id] || null;
  if (!rec) return null;
  // Compatibilidad: antes se guardaba directamente el layout en d[id].
  if (Array.isArray(rec.elements)) return { default: rec, themes: {} };
  return { default: rec.default || null, themes: rec.themes || {} };
}

function get(id, theme) {
  const entry = entryFor(load(), id);
  if (!entry) return null;
  const key = String(theme || '').trim();
  return (key && entry.themes && entry.themes[key]) || entry.default || null;
}

function set(id, theme, layout, options = {}) {
  const d = load();
  const key = String(theme || '').trim();
  const entry = entryFor(d, id) || { default: null, themes: {} };
  if (key) {
    if (layout && Array.isArray(layout.elements)) entry.themes[key] = layout;
    else delete entry.themes[key];
  } else if (layout && Array.isArray(layout.elements)) {
    entry.default = layout;
    if (options.clearThemes === true) entry.themes = {};
  } else {
    entry.default = null;
  }
  if (entry.default || Object.keys(entry.themes).length) d[id] = entry;
  else delete d[id];
  require('./util/atomicWrite').writeJsonAtomic(file(), d);
  return d;
}
module.exports = { load, get, set };
