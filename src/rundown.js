'use strict';
// Escaleta editorial: ordena bloques recurrentes y los materializa como cartelas.
// Los JSON vivos quedan en data/rundown.json y data/content-library.json.
const fs = require('fs');
const path = require('path');
const store = require('./store');

const DATA_DIR = path.join(__dirname, '..', 'data');
const RUNDOWN_FILE = path.join(DATA_DIR, 'rundown.json');
const LIBRARY_FILE = path.join(DATA_DIR, 'content-library.json');

const DEFAULT_LIBRARY = {
  datosUtiles: [
    { title: '112', subtitle: 'Emergencias', body: 'Guarda este número para cualquier urgencia.', template: 'dato', theme: 'lima' },
    { title: '010', subtitle: 'Atención ciudadana', body: 'Información municipal y trámites en Vitoria-Gasteiz.', template: 'dato', theme: 'azul' },
  ],
  citasHistoricas: [
    { title: 'La información es poder.', subtitle: 'Francis Bacon', template: 'cita', theme: 'carbon' },
    { title: 'La ciudad también se escribe en sus pequeñas noticias.', subtitle: 'Archivo local', template: 'cita', theme: 'carbon' },
  ],
  datosCuriosos: [
    { title: 'Vitoria-Gasteiz tiene más de 40 m2 de zona verde por habitante.', subtitle: 'Dato curioso', template: 'dato', theme: 'lima' },
    { title: 'El anillo verde suma más de 30 kilómetros de recorrido.', subtitle: 'Dato curioso', template: 'dato', theme: 'azul' },
  ],
  efemerides: [
    { title: 'Hoy también pasó algo que merece memoria.', subtitle: 'Efeméride', body: 'Añade aquí efemérides locales o históricas.', template: 'noticia', theme: 'carbon' },
  ],
  consejosInformaticos: [
    { title: 'Actualiza antes de apagar', subtitle: 'Consejo informático', body: 'Un sistema actualizado evita sustos y pérdidas de tiempo.', template: 'noticia', theme: 'azul' },
    { title: 'Activa la verificación en dos pasos', subtitle: 'Consejo informático', body: 'Es la barrera más sencilla contra robos de cuentas.', template: 'noticia', theme: 'lima' },
  ],
  comentariosSemana: [
    { title: 'La conversación también es ciudad.', subtitle: 'Comentario de la semana', body: 'Selecciona aquí un comentario destacado de GasteizBerri.', template: 'cita', theme: 'carbon' },
  ],
};

const DEFAULT_RUNDOWN = {
  title: 'Protoescaleta diaria',
  updatedAt: null,
  slots: [
    fixed('intro', 'Intro', 'mensaje', 'carbon', 'LA PANTALLA', '', '', 5, true),
    fixed('subintro', 'Subintro', 'mensaje', 'azul', 'Gasteiz en claro', 'Titulares, datos útiles y vida local', '', 5, true),
    fixed('ultima_hora', 'Última hora', 'alerta', 'rojo', 'Última hora pendiente', 'Añade titular', 'Completa este bloque si hay urgencia.', 8, true),
    worker('temperatura', 'Temperatura', 'clima', 'azul', 'weather', '24ºC', 'SOLEADO', 'Máx 28º · Mín 14º'),
    library('dato_util', 'Dato útil', 'datosUtiles'),
    library('cita_historica', 'Cita histórica', 'citasHistoricas'),
    library('dato_curioso', 'Dato curioso', 'datosCuriosos'),
    worker('aforo_piscinas', 'Aforo piscinas', 'dato', 'lima', 'poolCapacity', 'Aforo piscinas', 'Pendiente de worker', 'Gamarra / Mendizorrotza'),
    worker('precio_luz', 'Precio de la luz hoy', 'dato', 'azul', 'powerPrice', 'Precio luz', 'Pendiente de worker', 'Actualización diaria'),
    library('efemeride_hoy', 'Efeméride hoy', 'efemerides'),
    fixed('agenda', 'Agenda', 'agenda', 'blanco', 'Agenda', '', '19:30 | Actividad pendiente | Lugar\n20:00 | Añade eventos | Vitoria-Gasteiz', 10, false),
    library('consejo_informatico', 'Consejo informático', 'consejosInformaticos'),
    library('comentario_semana', 'Comentario de la semana', 'comentariosSemana'),
    fixed('cierre', 'Cierre', 'mensaje', 'carbon', 'Seguimos en GasteizBerri', 'gasteizberri.com', '', 5, true),
  ],
};

function fixed(id, label, template, theme, title, subtitle, body, duration, video) {
  return { id, label, enabled: true, source: 'fixed', template, theme, title, subtitle, body, duration, video: video === true };
}

function library(id, label, libraryKey) {
  return { id, label, enabled: true, source: 'library', libraryKey, duration: 8, video: false };
}

function worker(id, label, template, theme, workerKey, title, subtitle, body) {
  return { id, label, enabled: true, source: 'worker', workerKey, template, theme, title, subtitle, body, duration: 8, video: false };
}

function ensureFiles() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(RUNDOWN_FILE)) writeJson(RUNDOWN_FILE, DEFAULT_RUNDOWN);
  if (!fs.existsSync(LIBRARY_FILE)) writeJson(LIBRARY_FILE, DEFAULT_LIBRARY);
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  return data;
}

function read() {
  ensureFiles();
  const rundown = readJson(RUNDOWN_FILE, DEFAULT_RUNDOWN);
  const library = readJson(LIBRARY_FILE, DEFAULT_LIBRARY);
  if (!Array.isArray(rundown.slots)) rundown.slots = [];
  return { rundown, library, report: report(rundown, library) };
}

function save(rundown) {
  const next = {
    title: rundown.title || 'Escaleta',
    updatedAt: new Date().toISOString(),
    slots: Array.isArray(rundown.slots) ? rundown.slots.map(normalizeSlot) : [],
  };
  writeJson(RUNDOWN_FILE, next);
  return read();
}

function reset() {
  writeJson(RUNDOWN_FILE, DEFAULT_RUNDOWN);
  if (!fs.existsSync(LIBRARY_FILE)) writeJson(LIBRARY_FILE, DEFAULT_LIBRARY);
  return read();
}

function normalizeSlot(slot) {
  return {
    id: String(slot.id || ('slot_' + Date.now())),
    label: String(slot.label || slot.id || 'Bloque'),
    enabled: slot.enabled !== false,
    source: slot.source || 'fixed',
    libraryKey: slot.libraryKey || '',
    workerKey: slot.workerKey || '',
    template: slot.template || '',
    theme: slot.theme || '',
    title: slot.title || '',
    subtitle: slot.subtitle || '',
    body: slot.body || '',
    date: slot.date || '',
    duration: Number(slot.duration) || 8,
    video: slot.video === true,
  };
}

function pickDaily(items, key) {
  if (!Array.isArray(items) || !items.length) return null;
  const day = new Date().toISOString().slice(0, 10);
  let h = 0;
  for (const ch of `${day}:${key}`) h = ((h << 5) - h + ch.charCodeAt(0)) | 0;
  return items[Math.abs(h) % items.length];
}

function slotPayload(slot, library) {
  const s = normalizeSlot(slot);
  if (s.source === 'library') {
    const item = pickDaily(library[s.libraryKey], s.id);
    return item ? { ...item } : {
      title: s.label,
      subtitle: 'Pendiente',
      body: `Añade entradas en data/content-library.json > ${s.libraryKey}`,
      template: 'noticia',
      theme: 'rojo',
      missing: true,
    };
  }
  if (s.source === 'worker') {
    return {
      title: s.title || s.label,
      subtitle: s.subtitle || 'Pendiente de worker',
      body: s.body || `Conectar worker: ${s.workerKey}`,
      template: s.template || 'noticia',
      theme: s.theme || 'azul',
      missing: true,
    };
  }
  return s;
}

function toCard(slot, library, order) {
  const s = normalizeSlot(slot);
  const p = slotPayload(s, library);
  return store.normalize({
    id: `rd_${s.id}`,
    order,
    enabled: s.enabled,
    type: 'generated',
    template: p.template || s.template || 'noticia',
    theme: p.theme || s.theme || null,
    title: p.title || s.title || s.label,
    subtitle: p.subtitle || s.subtitle || '',
    body: p.body || s.body || '',
    date: p.date || s.date || '',
    duration: s.duration || p.duration || 8,
    video: s.video === true,
    source: 'rundown',
    slug: s.id,
    rundownSlot: s.id,
  });
}

function report(rundown, library) {
  return (rundown.slots || []).map((slot, i) => {
    const s = normalizeSlot(slot);
    const p = slotPayload(s, library);
    const missing = s.enabled && (p.missing || !p.title);
    return {
      id: s.id,
      order: i + 1,
      label: s.label,
      enabled: s.enabled,
      source: s.source,
      libraryKey: s.libraryKey,
      workerKey: s.workerKey,
      template: p.template || s.template || '',
      title: p.title || '',
      subtitle: p.subtitle || '',
      missing: Boolean(missing),
      note: missing ? (s.source === 'worker' ? `Pendiente worker: ${s.workerKey}` : 'Pendiente de contenido') : '',
    };
  });
}

function materialize() {
  const { rundown, library, report: rep } = read();
  const active = (rundown.slots || []).filter((s) => s.enabled !== false);
  const generated = active.map((slot, i) => toCard(slot, library, i + 1));
  const manual = store.list()
    .filter((card) => card.source !== 'rundown')
    .map((card, i) => ({ ...card, order: generated.length + i + 1 }));
  store.save({ cards: [...generated, ...manual] });
  return { ok: true, count: generated.length, cards: generated, report: rep };
}

module.exports = { read, save, reset, materialize, RUNDOWN_FILE, LIBRARY_FILE };
