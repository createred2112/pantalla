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
  days: {},
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
    { title: 'Actualiza antes de apagar', subtitle: 'Consejo · por Fast2Computer', body: 'Un sistema actualizado evita sustos y pérdidas de tiempo.', template: 'noticia', theme: 'azul' },
    { title: 'Activa la verificación en dos pasos', subtitle: 'Consejo · por Fast2Computer', body: 'Es la barrera más sencilla contra robos de cuentas.', template: 'noticia', theme: 'lima' },
  ],
  comentariosSemana: [
    { title: 'La conversación también es ciudad.', subtitle: 'Comentario de la semana', body: 'Selecciona aquí un comentario destacado de GasteizBerri.', template: 'cita', theme: 'carbon' },
  ],
};

const LIBRARY_KEYS = [
  { key: 'datosUtiles', label: 'Datos útiles', template: 'dato', theme: 'lima' },
  { key: 'citasHistoricas', label: 'Citas históricas', template: 'cita', theme: 'carbon' },
  { key: 'datosCuriosos', label: 'Datos curiosos', template: 'dato', theme: 'lima' },
  { key: 'efemerides', label: 'Efemérides', template: 'noticia', theme: 'carbon' },
  { key: 'consejosInformaticos', label: 'Consejos informáticos', template: 'noticia', theme: 'azul' },
  { key: 'comentariosSemana', label: 'Comentarios de la semana', template: 'cita', theme: 'carbon' },
];

const DEFAULT_RUNDOWN = {
  title: 'Protoescaleta diaria',
  updatedAt: null,
  slots: [
    fixed('intro', 'Intro', 'mensaje', 'carbon', 'GASTEIZBERRI', '', '', 5, true),
    fixed('subintro', 'Subintro', 'mensaje', 'azul', 'Gasteiz en claro', 'Titulares, datos útiles y vida local', '', 5, true),
    fixed('ultima_hora', 'Última hora', 'alerta', 'rojo', 'Última hora pendiente', 'Añade titular', 'Completa este bloque si hay urgencia.', 8, true),
    worker('temperatura', 'Temperatura', 'clima', 'azul', 'weather', '24ºC', 'SOLEADO', 'Máx 28º · Mín 14º'),
    library('dato_util', 'Dato útil', 'datosUtiles'),
    library('cita_historica', 'Cita histórica', 'citasHistoricas'),
    library('dato_curioso', 'Dato curioso', 'datosCuriosos'),
    worker('aforo_piscinas', 'Aforo piscinas', 'dato', 'lima', 'poolCapacity', 'Aforo piscinas', 'Pendiente de worker', 'Gamarra / Mendizorrotza'),
    worker('precio_luz', 'Precio de la luz hoy', 'luz', '', 'powerPrice', 'Precio luz', 'Pendiente de datos', 'Actualización diaria'),
    worker('gasolina_hoy', 'Gasolina más barata', 'gasolina', '', 'fuel', 'Gasolina 95', 'Pendiente de datos', ''),
    library('efemeride_hoy', 'Efeméride hoy', 'efemerides'),
    fixed('agenda', 'Agenda', 'agenda', 'blanco', 'Agenda', '', '19:30 | Actividad pendiente | Lugar\n20:00 | Añade eventos | Vitoria-Gasteiz', 10, false),
    library('consejo_informatico', 'Consejo informático', 'consejosInformaticos'),
    fixed('cortesia', 'Cortesía Fast2Computer', 'noticia', 'carbon',
      'Fast2Computer', 'Esta pantalla es posible gracias a',
      'Tu tienda de informática en Vitoria-Gasteiz · fast2computer.com', 6, false),
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
  return require('./util/atomicWrite').writeJsonAtomic(file, data);
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeLibraryItem(item, defaults) {
  const dates = Array.isArray(item && item.dates)
    ? item.dates
    : String((item && item.dates) || '').split(',');
  const weekdays = Array.isArray(item && item.weekdays)
    ? item.weekdays
    : String((item && item.weekdays) || '').split(',');
  return {
    title: String((item && item.title) || ''),
    subtitle: String((item && item.subtitle) || ''),
    body: String((item && item.body) || ''),
    template: String((item && item.template) || defaults.template || 'noticia'),
    theme: String((item && item.theme) || defaults.theme || ''),
    date: String((item && item.date) || ''),
    enabled: !item || item.enabled !== false,
    start: String((item && (item.start || item.from)) || ''),
    end: String((item && (item.end || item.to)) || ''),
    dates: dates.map((d) => String(d).trim()).filter(Boolean),
    weekdays: weekdays.map((d) => Number(d)).filter((n) => n >= 1 && n <= 7),
    notes: String((item && item.notes) || ''),
  };
}

function dayNumber(date) {
  const jsDay = new Date(`${date}T12:00:00`).getDay();
  return jsDay === 0 ? 7 : jsDay;
}

// LOOK DEL DÍA: tema rotativo por día de la semana (L..D) para los bloques y
// piezas sin tema fijo ("Auto"). La pantalla cambia de paleta sola cada día.
const DAY_THEMES = ['azul', 'lima', 'carbon', 'rojo', 'azul', 'lima', 'carbon'];
function dayTheme(date) {
  return DAY_THEMES[(dayNumber(date || todayKey()) - 1) % DAY_THEMES.length];
}

function itemApplies(item, date) {
  const d = String(date || todayKey()).slice(0, 10);
  if (item.enabled === false) return false;
  if (item.dates && item.dates.length) return item.dates.includes(d);
  if (item.start && d < item.start) return false;
  if (item.end && d > item.end) return false;
  if (item.weekdays && item.weekdays.length && !item.weekdays.includes(dayNumber(d))) return false;
  return true;
}

function normalizeLibrary(library) {
  const src = library && typeof library === 'object' ? library : {};
  const next = { days: src.days && typeof src.days === 'object' ? src.days : {} };
  for (const meta of LIBRARY_KEYS) {
    const base = Array.isArray(src[meta.key]) ? src[meta.key] : DEFAULT_LIBRARY[meta.key];
    next[meta.key] = (base || []).map((item) => normalizeLibraryItem(item, meta)).filter((item) => item.title || item.body);
  }
  for (const [date, pack] of Object.entries(next.days)) {
    const clean = {};
    for (const meta of LIBRARY_KEYS) {
      clean[meta.key] = (Array.isArray(pack && pack[meta.key]) ? pack[meta.key] : [])
        .map((item) => normalizeLibraryItem(item, meta))
        .filter((item) => item.title || item.body);
    }
    next.days[date] = clean;
  }
  return next;
}

function dailyPack(library, date) {
  const lib = normalizeLibrary(library);
  const pack = lib.days[date] || {};
  const clean = {};
  for (const meta of LIBRARY_KEYS) clean[meta.key] = Array.isArray(pack[meta.key]) ? pack[meta.key] : [];
  return clean;
}

function libraryItems(library, key, date) {
  const lib = normalizeLibrary(library);
  const daily = lib.days[date] && Array.isArray(lib.days[date][key]) ? lib.days[date][key] : [];
  const pool = Array.isArray(lib[key]) ? lib[key] : [];
  const exact = pool.filter((item) => item.enabled !== false && item.dates && item.dates.includes(date));
  const scheduled = exact.length ? exact : pool.filter((item) => itemApplies(item, date));
  return [...daily, ...scheduled];
}

function read(options = {}) {
  ensureFiles();
  const rundown = readJson(RUNDOWN_FILE, DEFAULT_RUNDOWN);
  const library = normalizeLibrary(readJson(LIBRARY_FILE, DEFAULT_LIBRARY));
  const date = options.date || todayKey();
  if (!Array.isArray(rundown.slots)) rundown.slots = [];
  let workers = [];
  try { workers = require('./workers').state(); } catch {}
  return { rundown, library, libraryKeys: LIBRARY_KEYS, activeDate: date, dayTheme: dayTheme(date), workers, daily: dailyPack(library, date), report: report(rundown, library, date) };
}

// Saltos por día: rundown.days = { 'YYYY-MM-DD': { skip: [slotId, ...] } }.
// "Activa" apaga un bloque para SIEMPRE; skip lo salta SOLO ese día.
function cleanDays(days) {
  const out = {};
  for (const [d, v] of Object.entries(days && typeof days === 'object' ? days : {})) {
    const skip = Array.isArray(v && v.skip) ? [...new Set(v.skip.map(String).filter(Boolean))] : [];
    if (skip.length) out[String(d).slice(0, 10)] = { skip };
  }
  return out;
}

function skipSetFor(rundown, date) {
  return new Set((((rundown.days || {})[date] || {}).skip) || []);
}

function save(rundown, options = {}) {
  const next = {
    title: rundown.title || 'Escaleta',
    updatedAt: new Date().toISOString(),
    slots: Array.isArray(rundown.slots) ? rundown.slots.map(normalizeSlot) : [],
    days: cleanDays(rundown.days),
  };
  writeJson(RUNDOWN_FILE, next);
  return read(options);
}

function saveLibrary(library, options = {}) {
  writeJson(LIBRARY_FILE, normalizeLibrary(library));
  return read(options);
}

function saveDay(date, pack) {
  const day = String(date || todayKey()).slice(0, 10);
  const library = normalizeLibrary(readJson(LIBRARY_FILE, DEFAULT_LIBRARY));
  library.days[day] = {};
  for (const meta of LIBRARY_KEYS) {
    library.days[day][meta.key] = (Array.isArray(pack && pack[meta.key]) ? pack[meta.key] : [])
      .map((item) => normalizeLibraryItem(item, meta))
      .filter((item) => item.title || item.body);
  }
  writeJson(LIBRARY_FILE, library);
  return read({ date: day });
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
    // Cadencia del carrusel: 'dia' (una pieza por día) u 'hora' (cambia cada hora).
    rotation: slot.rotation === 'hora' ? 'hora' : 'dia',
  };
}

// Carrusel SIN repetir: recorre TODAS las piezas en orden y solo reinicia al
// agotarlas. Determinista (sin estado): el cursor avanza con el día — o con la
// hora actual si la cadencia es horaria. El offset desincroniza bloques.
function pickDaily(items, key, date, rotation) {
  if (!Array.isArray(items) || !items.length) return null;
  const step = rotation === 'hora'
    ? Math.floor(Date.now() / 3600000)
    : Math.floor(Date.parse(`${date || todayKey()}T12:00:00Z`) / 86400000);
  let off = 0;
  for (const ch of String(key)) off = (off + ch.charCodeAt(0)) % 9973;
  return items[(step + off) % items.length];
}

function slotPayload(slot, library, date) {
  const s = normalizeSlot(slot);
  if (s.source === 'library') {
    const item = pickDaily(libraryItems(library, s.libraryKey, date), s.id, date, s.rotation);
    return item ? { ...item } : {
      title: s.label,
      subtitle: 'Pendiente',
      body: `Añade piezas en Escaleta → Contenido programado (${s.libraryKey})`,
      template: 'noticia',
      theme: 'rojo',
      missing: true,
    };
  }
  if (s.source === 'worker') {
    // Dato automático REAL desde la caché de workers internos (si está vigente).
    const rec = require('./workers').get(s.workerKey);
    if (rec && rec.data) {
      return {
        title: rec.data.title,
        subtitle: rec.data.subtitle || s.subtitle || '',
        body: rec.data.body || '',
        date: rec.data.date || '',
        // El worker sabe cuál es su mejor presentación (luz→curva, fuel→lista).
        template: rec.data.template || s.template || 'dato',
        theme: s.theme || '',
        data: rec.data.extra || null,
        missing: false,
      };
    }
    // Worker MANUAL (p. ej. aforo piscinas): lo que escribas en el bloque
    // ES el contenido real, no un pendiente.
    if (require('./workers').isManual(s.workerKey) && s.title) {
      return { title: s.title, subtitle: s.subtitle || '', body: s.body || '', date: s.date || '', template: s.template || 'dato', theme: s.theme || '', missing: false };
    }
    return {
      title: s.title || s.label,
      subtitle: s.subtitle || 'Dato automático pendiente',
      body: s.body || `Sin datos recientes de "${s.workerKey}"`,
      template: s.template || 'noticia',
      theme: s.theme || 'azul',
      missing: true,
    };
  }
  return s;
}

function toCard(slot, library, order, date) {
  const s = normalizeSlot(slot);
  const p = slotPayload(s, library, date);
  return store.normalize({
    id: `rd_${s.id}`,
    order,
    enabled: s.enabled,
    type: 'generated',
    template: p.template || s.template || 'noticia',
    // Sin tema fijo → look del día (paleta rotativa determinista).
    theme: p.theme || s.theme || dayTheme(date),
    title: p.title || s.title || s.label,
    subtitle: p.subtitle || s.subtitle || '',
    body: p.body || s.body || '',
    date: p.date || s.date || '',
    data: p.data || null,
    duration: s.duration || p.duration || 8,
    video: s.video === true,
    source: 'rundown',
    slug: s.id,
    rundownSlot: s.id,
  });
}

function report(rundown, library, date) {
  const skip = skipSetFor(rundown, date);
  return (rundown.slots || []).map((slot, i) => {
    const s = normalizeSlot(slot);
    const p = slotPayload(s, library, date);
    const skippedToday = skip.has(s.id);
    const missing = s.enabled && !skippedToday && (p.missing || !p.title);
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
      skippedToday,
      note: missing ? (s.source === 'worker' ? `Pendiente worker: ${s.workerKey}` : 'Pendiente de contenido') : '',
    };
  });
}

function materialize(options = {}) {
  const { rundown, library, activeDate, report: rep } = read(options);
  const skip = skipSetFor(rundown, activeDate);
  const active = (rundown.slots || []).filter((s) => s.enabled !== false && !skip.has(String(s.id)));
  const generated = active.map((slot, i) => toCard(slot, library, i + 1, activeDate));
  const manual = store.list()
    .filter((card) => card.source !== 'rundown')
    .map((card, i) => ({ ...card, order: generated.length + i + 1 }));
  store.save({ cards: [...generated, ...manual] });
  return { ok: true, count: generated.length, cards: generated, report: rep };
}

module.exports = { read, save, saveLibrary, saveDay, reset, materialize, dayTheme, RUNDOWN_FILE, LIBRARY_FILE };
