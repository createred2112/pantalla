'use strict';
// Almacén de "cartelas" (cards) en data/cards.json.
// Cada card es una pantalla de la secuencia.
const fs = require('fs');
const { paths, cfg } = require('./config');
const { writeJsonAtomic } = require('./util/atomicWrite');

function id() {
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(paths.data, 'utf8'));
    if (!Array.isArray(data.cards)) data.cards = [];
    return data;
  } catch {
    return { cards: [] };
  }
}

function save(data) {
  return writeJsonAtomic(paths.data, data);
}

function list() {
  return load().cards;
}

// Cartelas activas, ordenadas por el campo "order".
function active() {
  return list()
    .filter((c) => c.enabled !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

function normalize(card) {
  return {
    id: card.id || id(),
    order: card.order != null ? Number(card.order) : 999,
    enabled: card.enabled !== false,
    // type: generated (se renderiza) | image (jpg/png ya listo) | video (mp4)
    type: card.type || 'generated',
    template: card.template || cfg.defaults.template,
    theme: card.theme || null,   // clave de paleta; null = la que trae la plantilla
    layout: card.layout || null, // diseño editado (elementos) de esta cartela; null = el de la plantilla
    video: card.video === true,  // si true, se genera MP4 animado en vez de JPG
    videoIntro: card.videoIntro || null, // MP4 opcional antes de la cartela animada
    videoOutro: card.videoOutro || null, // MP4 opcional después de la cartela animada
    title: card.title || '',
    subtitle: card.subtitle || '',
    body: card.body || '',
    date: card.date || '',       // texto de fecha opcional para el pie
    data: card.data || null,     // datos estructurados (series, listas) para plantillas con gráficos
    photo: card.photo || null,   // ruta a foto de fondo (para generated)
    file: card.file || null,     // ruta a archivo ya listo (image/video)
    duration: card.duration != null ? Number(card.duration) : cfg.defaults.duration,
    source: card.source || 'manual', // manual | worker | rundown
    slug: card.slug || null,
    rundownSlot: card.rundownSlot || null,
    updatedAt: new Date().toISOString(),
  };
}

function add(card) {
  const data = load();
  const c = normalize(card);
  if (c.order === 999) c.order = data.cards.length + 1;
  data.cards.push(c);
  save(data);
  return c;
}

function update(cardId, patch) {
  const data = load();
  const idx = data.cards.findIndex((c) => c.id === cardId);
  if (idx === -1) return null;
  data.cards[idx] = normalize({ ...data.cards[idx], ...patch, id: cardId });
  save(data);
  return data.cards[idx];
}

function remove(cardId) {
  const data = load();
  const before = data.cards.length;
  data.cards = data.cards.filter((c) => c.id !== cardId);
  save(data);
  return before !== data.cards.length;
}

// Reordena según un array de ids; reasigna order 1..N.
function reorder(orderedIds) {
  const data = load();
  const map = new Map(data.cards.map((c) => [c.id, c]));
  let n = 1;
  for (const cid of orderedIds) {
    const c = map.get(cid);
    if (c) c.order = n++;
  }
  data.cards.sort((a, b) => (a.order || 0) - (b.order || 0));
  save(data);
  return data.cards;
}

module.exports = { id, load, save, list, active, add, update, remove, reorder, normalize };
