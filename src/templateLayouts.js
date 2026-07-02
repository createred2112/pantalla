'use strict';
// Diseños por defecto a nivel de PLANTILLA (afectan a todas las cartelas de esa
// plantilla que no tengan su propio layout). Guardados en data/template-layouts.json.
const fs = require('fs');
const path = require('path');
const { paths } = require('./config');

const FILE = path.join(path.dirname(paths.data), 'template-layouts.json');

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; }
}
function get(id) { return load()[id] || null; }
function set(id, layout) {
  const d = load();
  if (layout && Array.isArray(layout.elements)) d[id] = layout; else delete d[id];
  require('./util/atomicWrite').writeJsonAtomic(FILE, d);
  return d;
}
module.exports = { load, get, set };
