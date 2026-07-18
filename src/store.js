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

// HORARIO por cartela: ¿le toca estar en pantalla ahora?
// schedule = { startAt, endAt (fecha+hora exactas), dailyFrom, dailyTo (franja
// diaria repetida, admite cruzar medianoche: 22:00 → 07:00) }.
function scheduleAllows(card, now = new Date()) {
  const s = card && card.schedule;
  if (!s) return true;
  if (s.startAt) { const t = Date.parse(s.startAt); if (Number.isFinite(t) && now.getTime() < t) return false; }
  if (s.endAt) { const t = Date.parse(s.endAt); if (Number.isFinite(t) && now.getTime() > t) return false; }
  const parseHm = (x) => { const m = String(x || '').match(/^(\d{1,2}):(\d{2})$/); return m ? (+m[1]) * 60 + (+m[2]) : null; };
  const a = parseHm(s.dailyFrom), b = parseHm(s.dailyTo);
  if (a != null || b != null) {
    const hm = now.getHours() * 60 + now.getMinutes();
    if (a != null && b != null) {
      const inside = a <= b ? (hm >= a && hm <= b) : (hm >= a || hm <= b);
      if (!inside) return false;
    } else if (a != null && hm < a) return false;
    else if (b != null && hm > b) return false;
  }
  return true;
}

// Cartelas activas, ordenadas por el campo "order". Aplica horarios por
// cartela y, si hay un TAKEOVER urgente en marcha, la emisión especial.
function active() {
  const base = list()
    .filter((c) => c.enabled !== false && scheduleAllows(c))
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  try { return require('./takeover').apply(base); } catch { return base; }
}

function normalize(card) {
  const type = card.type || 'generated';
  const forceVideo = type === 'generated' && (
    cfg.screenProfile && (cfg.screenProfile.forceVideo === true || String(cfg.screenProfile.outputFormat || '').toLowerCase() === 'mp4')
  );
  return {
    id: card.id || id(),
    order: card.order != null ? Number(card.order) : 999,
    enabled: card.enabled !== false,
    // type: generated (se renderiza) | image (jpg/png ya listo) | video (mp4)
    type,
    template: card.template || cfg.defaults.template,
    layout: card.layout || null, // diseño editado (elementos) de esta cartela; null = el de la plantilla
    video: card.video === true || forceVideo,  // si true, se genera MP4 animado en vez de JPG
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
    // Horario propio (cartelas manuales): fuera de ventana no entra en emisión.
    schedule: card.schedule && typeof card.schedule === 'object'
      ? {
        startAt: String(card.schedule.startAt || ''),
        endAt: String(card.schedule.endAt || ''),
        dailyFrom: String(card.schedule.dailyFrom || ''),
        dailyTo: String(card.schedule.dailyTo || ''),
      }
      : null,
    slug: card.slug || null,
    rundownSlot: card.rundownSlot || null,
    bumperKey: card.bumperKey || null,
    rundownLibraryKey: card.rundownLibraryKey || null,
    rundownWorkerKey: card.rundownWorkerKey || null,
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

module.exports = { id, load, save, list, active, add, update, remove, reorder, normalize, scheduleAllows };
