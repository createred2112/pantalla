'use strict';
// PLANTILLAS PROPIAS ("Mis diseños"): cualquier composición del editor visual
// se puede guardar como plantilla nueva con nombre. Viven en
// data/user-templates.json con su composición DENTRO y aparecen en la galería
// como una plantilla más.
const fs = require('fs');
const path = require('path');
const { paths } = require('./config');
const { writeJsonAtomic } = require('./util/atomicWrite');

const FILE = path.join(path.dirname(paths.data), 'user-templates.json');

function load() {
  try {
    const d = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return Array.isArray(d) ? d : [];
  } catch { return []; }
}

function list() { return load(); }

function get(id) {
  return load().find((t) => t.id === String(id)) || null;
}

function slug(text) {
  return String(text || '').normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'diseno';
}

function create({ label, base, layout } = {}) {
  const name = String(label || '').trim();
  if (!name) return { ok: false, error: 'Ponle un nombre a la plantilla' };
  if (!layout || !Array.isArray(layout.elements) || !layout.elements.length) {
    return { ok: false, error: 'La composición está vacía' };
  }
  const items = load();
  const id = 'u_' + slug(name) + '_' + Date.now().toString(36).slice(-4);
  items.push({
    id,
    label: name,
    base: String(base || 'noticia'),
    layout,
    createdAt: new Date().toISOString(),
  });
  writeJsonAtomic(FILE, items);
  return { ok: true, id, label: name };
}

function remove(id) {
  const items = load();
  const next = items.filter((t) => t.id !== String(id));
  if (next.length === items.length) return { ok: false, error: 'No existe esa plantilla' };
  writeJsonAtomic(FILE, next);
  return { ok: true };
}

module.exports = { list, get, create, remove, FILE };
