'use strict';
// Escaleta editorial: ordena bloques recurrentes y los materializa como cartelas.
// Los JSON vivos quedan en data/rundown.json y data/content-library.json.
const fs = require('fs');
const path = require('path');
const store = require('./store');
const { cfg } = require('./config');

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
    { title: 'Vitoria-Gasteiz tiene más de 40 m2 de zona verde por habitante.', subtitle: 'Dato curioso', template: 'datocurioso', theme: 'lima' },
    { title: 'El anillo verde suma más de 30 kilómetros de recorrido.', subtitle: 'Dato curioso', template: 'datocurioso', theme: 'azul' },
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
  agendaBanco: [],
  agendaEventos: [
    { title: 'Agenda', subtitle: 'Hoy', body: '19:30 | Actividad pendiente | Lugar\n20:00 | Añade eventos | Vitoria-Gasteiz', template: 'agenda', theme: 'blanco' },
  ],
  fotosGasteizberri: [],
  avisosMeteorologicos: [],
  consejosMeteorologicos: [
    { title: 'Cuida la hidratación', subtitle: 'Consejo por calor', body: 'Bebe agua aunque no tengas sed y evita el sol en las horas centrales.', template: 'meteoaviso', theme: 'naranja', enabled: false },
  ],
};

const LIBRARY_KEYS = [
  { key: 'datosUtiles', label: 'Datos útiles', template: 'dato', theme: 'lima' },
  { key: 'citasHistoricas', label: 'Citas históricas', template: 'cita', theme: 'carbon' },
  { key: 'datosCuriosos', label: 'Datos curiosos', template: 'datocurioso', theme: 'lima' },
  { key: 'efemerides', label: 'Efemérides', template: 'noticia', theme: 'carbon' },
  { key: 'consejosInformaticos', label: 'Consejos informáticos', template: 'noticia', theme: 'azul' },
  { key: 'comentariosSemana', label: 'Comentarios de la semana', template: 'cita', theme: 'carbon' },
  { key: 'agendaEventos', label: 'Agenda viva', template: 'agenda', theme: 'blanco' },
  { key: 'avisosMeteorologicos', label: 'Avisos meteorológicos', template: 'meteoaviso', theme: 'naranja' },
  { key: 'consejosMeteorologicos', label: 'Consejos meteorológicos', template: 'meteoaviso', theme: 'naranja' },
  { key: 'fotosGasteizberri', label: 'Fotos GasteizBerri', template: 'foto', theme: 'carbon' },
];

const DEFAULT_HOURLY_LIBRARY_KEYS = new Set(['avisosMeteorologicos', 'consejosMeteorologicos', 'fotosGasteizberri']);

const DEFAULT_RUNDOWN = {
  title: 'Protoescaleta diaria',
  updatedAt: null,
  slots: [
    fixed('intro', 'Intro', 'mensaje', 'carbon', 'GASTEIZBERRI', '', '', 5, true),
    fixed('subintro', 'Subintro', 'mensaje', 'azul', 'Gasteiz en claro', 'Titulares, datos útiles y vida local', '', 5, true),
    fixed('ultima_hora', 'Última hora', 'alerta', 'rojo', 'Última hora pendiente', 'Añade titular', 'Completa este bloque si hay urgencia.', 8, true),
    worker('temperatura', 'Tiempo ahora', 'clima', 'azul', 'weather', '24º', 'SOLEADO', ''),
    library('dato_util', 'Dato útil', 'datosUtiles'),
    library('cita_historica', 'Cita histórica', 'citasHistoricas'),
    library('dato_curioso', 'Dato curioso', 'datosCuriosos'),
    worker('aforo_piscinas', 'Aforo piscinas', 'dato', 'lima', 'poolCapacity', 'Aforo piscinas', 'Pendiente de worker', 'Gamarra / Mendizorrotza'),
    worker('precio_luz', 'Precio de la luz hoy', 'luz', '', 'powerPrice', 'Precio luz', 'Pendiente de datos', 'Actualización diaria'),
    library('efemeride_hoy', 'Efeméride hoy', 'efemerides'),
    fixed('agenda', 'Agenda', 'agenda', 'blanco', 'Agenda', '', '19:30 | Actividad pendiente | Lugar\n20:00 | Añade eventos | Vitoria-Gasteiz', 10, false),
    library('consejo_informatico', 'Consejo informático', 'consejosInformaticos'),
    fixed('cortesia', 'Cortesía Fast2Computer', 'noticia', 'carbon',
      'Fast2Computer', 'Esta pantalla es posible gracias a',
      'Tu tienda de informática en Vitoria-Gasteiz · fast2computer.com', 6, false),
    library('comentario_semana', 'Comentario de la semana', 'comentariosSemana'),
    library('foto_gasteizberri', 'Foto GasteizBerri', 'fotosGasteizberri'),
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
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function normalizeLibraryItem(item, defaults) {
  const dates = Array.isArray(item && item.dates)
    ? item.dates
    : String((item && item.dates) || '').split(',');
  const weekdays = Array.isArray(item && item.weekdays)
    ? item.weekdays
    : String((item && item.weekdays) || '').split(',');
  // La plantilla elegida EN LA PIEZA manda. Antes el banco la machacaba en
  // silencio (todo "datos curiosos" acababa en datocurioso aunque eligieras
  // otra) y era imposible entender por qué la cartela no salía como pedías.
  // El banco solo decide cuando la pieza no trae plantilla propia.
  const explicit = String((item && item.template) || '').trim();
  let template = explicit || String(defaults.template || 'noticia');
  const title = String((item && item.title) || '');
  const shortFigure = title.replace(/\s+/g, '').length <= 9;
  if (!explicit) {
    if (defaults.key === 'datosCuriosos') template = 'datocurioso';
    if (defaults.key === 'datosUtiles' && shortFigure) template = 'dato';
  }
  return {
    title,
    subtitle: String((item && item.subtitle) || ''),
    body: String((item && item.body) || ''),
    template,
    theme: String((item && item.theme) || defaults.theme || ''),
    photo: String((item && item.photo) || ''),
    date: String((item && item.date) || ''),
    enabled: !item || item.enabled !== false,
    start: String((item && (item.start || item.from)) || ''),
    end: String((item && (item.end || item.to)) || ''),
    startAt: String((item && (item.startAt || item.fromAt)) || ''),
    endAt: String((item && (item.endAt || item.toAt)) || ''),
    dates: dates.map((d) => String(d).trim()).filter(Boolean),
    weekdays: weekdays.map((d) => Number(d)).filter((n) => n >= 1 && n <= 7),
    notes: String((item && item.notes) || ''),
    eventIds: Array.isArray(item && item.eventIds) ? item.eventIds.map(String).filter(Boolean) : [],
    showEventDates: !item || item.showEventDates !== false,
    // Agenda: ocultar cada evento cuando pase su hora (45 min de gracia).
    hideExpired: Boolean(item && item.hideExpired === true),
  };
}

function agendaEventId(item) {
  const raw = `${item && item.date || ''}|${item && item.time || ''}|${item && item.title || ''}|${item && item.subtitle || ''}|${item && item.place || ''}`.toLowerCase();
  let hash = 0;
  for (const ch of raw) hash = ((hash * 31) + ch.charCodeAt(0)) >>> 0;
  return `evt_${hash.toString(36)}`;
}

function normalizeAgendaEvent(item) {
  const ev = item && typeof item === 'object' ? item : {};
  const next = {
    id: String(ev.id || agendaEventId(ev)),
    date: String(ev.date || ev.day || '').trim().slice(0, 10),
    time: String(ev.time || '').trim(),
    title: String(ev.title || ev.name || '').trim(),
    subtitle: String(ev.subtitle || '').trim(),
    place: String(ev.place || ev.location || '').trim(),
    notes: String(ev.notes || '').trim(),
    enabled: ev.enabled !== false,
  };
  return next;
}

function agendaLineToEvent(line) {
  const parts = String(line || '').split('|').map((x) => x.trim());
  const dated = /^\d{4}-\d{2}-\d{2}$/.test(parts[0] || '');
  const ev = normalizeAgendaEvent({
    date: dated ? parts[0] : '',
    time: dated ? (parts[1] || '') : (parts.length >= 3 ? parts[0] : ''),
    title: dated ? (parts[2] || '') : (parts.length >= 3 ? parts[1] : (parts[0] || '')),
    subtitle: dated && parts.length >= 5 ? parts[3] : (!dated && parts.length >= 4 ? parts[2] : ''),
    place: dated
      ? (parts.length >= 5 ? parts[4] : (parts[3] || ''))
      : (parts.length >= 4 ? parts[3] : (parts.length >= 3 ? parts[2] : (parts[1] || ''))),
  });
  return ev.title ? ev : null;
}

function agendaEventLine(ev) {
  const detail = [ev.subtitle, ev.place].map((x) => String(x || '').trim()).filter(Boolean).join(' · ');
  return [ev.date, ev.time, ev.title, detail].map((x) => String(x || '').trim()).filter(Boolean).join(' | ');
}

function dayNumber(date) {
  const jsDay = new Date(`${date}T12:00:00`).getDay();
  return jsDay === 0 ? 7 : jsDay;
}

// Sugerencia histórica por día. Ya no se aplica automáticamente: "Auto"
// significa usar el color propio de la pieza o de su plantilla.
const DAY_THEMES = ['azul', 'lima', 'carbon', 'rojo', 'azul', 'lima', 'carbon'];
function autoDayTheme(date) {
  return DAY_THEMES[(dayNumber(date || todayKey()) - 1) % DAY_THEMES.length];
}
function dayTheme(date, rundown) {
  const day = String(date || todayKey()).slice(0, 10);
  const rec = rundown && rundown.days && rundown.days[day];
  const chosen = rec && String(rec.theme || '').trim();
  return chosen || '';
}

function itemApplies(item, date) {
  const d = String(date || todayKey()).slice(0, 10);
  if (item.enabled === false) return false;
  if (item.dates && item.dates.length && !item.dates.includes(d)) return false;
  const now = new Date();
  const dayStart = new Date(`${d}T00:00:00`);
  const dayEnd = new Date(`${d}T23:59:59`);
  if (item.startAt) {
    const startAt = new Date(item.startAt);
    if (!Number.isNaN(startAt.getTime()) && dayEnd < startAt) return false;
    if (d === todayKey() && !Number.isNaN(startAt.getTime()) && now < startAt) return false;
  }
  if (item.endAt) {
    const endAt = new Date(item.endAt);
    if (!Number.isNaN(endAt.getTime()) && dayStart > endAt) return false;
    if (d === todayKey() && !Number.isNaN(endAt.getTime()) && now > endAt) return false;
  }
  if (item.start && d < item.start) return false;
  if (item.end && d > item.end) return false;
  if (item.weekdays && item.weekdays.length && !item.weekdays.includes(dayNumber(d))) return false;
  return true;
}

function normalizeLibrary(library) {
  const src = library && typeof library === 'object' ? library : {};
  const next = { days: src.days && typeof src.days === 'object' ? src.days : {} };
  next.agendaBanco = (Array.isArray(src.agendaBanco) ? src.agendaBanco : [])
    .map(normalizeAgendaEvent)
    .filter((item) => item.title);
  for (const meta of LIBRARY_KEYS) {
    const base = Array.isArray(src[meta.key])
      ? src[meta.key]
      : (meta.key === 'agendaEventos' ? [] : DEFAULT_LIBRARY[meta.key]);
    next[meta.key] = (base || [])
      .map((item) => normalizeLibraryItem(item, meta))
      .filter((item) => item.title || item.body || item.photo || (item.eventIds && item.eventIds.length));
  }
  if (!next.agendaBanco.length && Array.isArray(next.agendaEventos)) {
    const byKey = new Map();
    for (const item of next.agendaEventos) {
      for (const line of String(item.body || '').split(/\r?\n/)) {
        const ev = agendaLineToEvent(line);
        if (ev && !byKey.has(ev.id)) byKey.set(ev.id, ev);
      }
    }
    next.agendaBanco = [...byKey.values()];
  }
  for (const [date, pack] of Object.entries(next.days)) {
    const clean = {};
    for (const meta of LIBRARY_KEYS) {
      clean[meta.key] = (Array.isArray(pack && pack[meta.key]) ? pack[meta.key] : [])
        .map((item) => normalizeLibraryItem(item, meta))
        .filter((item) => item.title || item.body || item.photo || (item.eventIds && item.eventIds.length));
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

// ¿Ha pasado ya la hora de este evento? (45 min de gracia tras el inicio)
function agendaEventExpired(ev) {
  if (!ev || !ev.date || !ev.time) return false;
  const t = Date.parse(`${ev.date}T${ev.time}:00`);
  return Number.isFinite(t) && Date.now() > t + 45 * 60000;
}

function resolveAgendaItem(item, library) {
  const ids = Array.isArray(item && item.eventIds) ? item.eventIds.map(String).filter(Boolean) : [];
  if (!ids.length) return item;
  const bank = new Map((library.agendaBanco || []).map((ev) => [String(ev.id), ev]));
  const fallbackDate = String(item.startAt || item.start || (item.dates && item.dates[0]) || '').slice(0, 10);
  const showEventDates = item.showEventDates !== false;
  const lines = ids
    .map((id) => bank.get(id))
    .filter((ev) => ev && ev.enabled !== false)
    .filter((ev) => !(item.hideExpired && agendaEventExpired(ev)))
    .map((ev) => {
      const dated = ev.date ? ev : { ...ev, date: fallbackDate };
      return agendaEventLine(showEventDates ? dated : { ...dated, date: '' });
    })
    .filter(Boolean);
  return { ...item, body: lines.join('\n') || item.body || '' };
}

function libraryItems(library, key, date) {
  const lib = normalizeLibrary(library);
  const daily = lib.days[date] && Array.isArray(lib.days[date][key]) ? lib.days[date][key] : [];
  const pool = Array.isArray(lib[key]) ? lib[key] : [];
  const exact = pool.filter((item) => item.enabled !== false && item.dates && item.dates.includes(date) && itemApplies(item, date));
  const scheduled = exact.length ? exact : pool.filter((item) => itemApplies(item, date));
  const items = [...daily, ...scheduled];
  return key === 'agendaEventos' ? items.map((item) => resolveAgendaItem(item, lib)) : items;
}

function read(options = {}) {
  ensureFiles();
  const rundown = readJson(RUNDOWN_FILE, DEFAULT_RUNDOWN);
  upgradeRundown(rundown);
  const library = normalizeLibrary(readJson(LIBRARY_FILE, DEFAULT_LIBRARY));
  const date = options.date || todayKey();
  if (!Array.isArray(rundown.slots)) rundown.slots = [];
  let workers = [];
  try { workers = require('./workers').state(); } catch {}
  return { rundown, library, libraryKeys: LIBRARY_KEYS, activeDate: date, dayTheme: dayTheme(date, rundown), autoDayTheme: autoDayTheme(date), workers, daily: dailyPack(library, date), report: report(rundown, library, date) };
}

function upgradeRundown(rundown) {
  if (!rundown || !Array.isArray(rundown.slots)) return rundown;
  rundown.slots = rundown.slots.filter((slot) => !(slot && slot.id === 'gasolina_hoy'));
  // Bloque "Foto GasteizBerri" (carrusel horario de fotos elegidas de la web).
  // Se añade APAGADO en escaletas existentes: no cambia la emisión hasta que
  // el usuario lo active y llene el banco de fotos.
  if (!rundown.slots.some((slot) => slot && slot.libraryKey === 'fotosGasteizberri')) {
    const s = { ...library('foto_gasteizberri', 'Foto GasteizBerri', 'fotosGasteizberri'), enabled: false };
    const idx = rundown.slots.findIndex((slot) => slot && slot.id === 'cierre');
    if (idx >= 0) rundown.slots.splice(idx, 0, s); else rundown.slots.push(s);
  }
  for (const slot of rundown.slots) {
    if (slot && slot.id === 'agenda' && slot.source !== 'library') {
      slot.source = 'library';
      slot.libraryKey = 'agendaEventos';
      slot.template = '';
      slot.theme = '';
    }
  }
  rundown.slots = rundown.slots.map(normalizeSlot);
  return rundown;
}

// Saltos por día: rundown.days = { 'YYYY-MM-DD': { skip: [slotId, ...] } }.
// "Activa" apaga un bloque para SIEMPRE; skip lo salta SOLO ese día.
function cleanDays(days) {
  const out = {};
  for (const [d, v] of Object.entries(days && typeof days === 'object' ? days : {})) {
    const skip = Array.isArray(v && v.skip) ? [...new Set(v.skip.map(String).filter(Boolean))] : [];
    const theme = String((v && v.theme) || '').trim();
    const pick = {};
    const autoPick = {};
    for (const [slotId, idx] of Object.entries((v && v.pick && typeof v.pick === 'object') ? v.pick : {})) {
      const n = Number(idx);
      if (String(slotId).trim() && Number.isInteger(n) && n >= 0) pick[String(slotId)] = n;
    }
    for (const [slotId, rec] of Object.entries((v && v.autoPick && typeof v.autoPick === 'object') ? v.autoPick : {})) {
      const n = Number(rec && rec.index);
      const step = Number(rec && rec.step);
      if (String(slotId).trim() && Number.isInteger(n) && n >= 0 && Number.isInteger(step)) {
        autoPick[String(slotId)] = { index: n, step };
      }
    }
    if (skip.length || Object.keys(pick).length || Object.keys(autoPick).length || theme) {
      out[String(d).slice(0, 10)] = {
        skip,
        ...(theme ? { theme } : {}),
        ...(Object.keys(pick).length ? { pick } : {}),
        ...(Object.keys(autoPick).length ? { autoPick } : {}),
      };
    }
  }
  return out;
}

function skipSetFor(rundown, date) {
  return new Set((((rundown.days || {})[date] || {}).skip) || []);
}

function pickMapFor(rundown, date) {
  const raw = (((rundown.days || {})[date] || {}).pick) || {};
  const out = {};
  for (const [slotId, idx] of Object.entries(raw)) {
    const n = Number(idx);
    if (Number.isInteger(n) && n >= 0) out[slotId] = n;
  }
  return out;
}

function autoPickMapFor(rundown, date) {
  const raw = (((rundown.days || {})[date] || {}).autoPick) || {};
  const out = {};
  for (const [slotId, rec] of Object.entries(raw)) {
    const index = Number(rec && rec.index);
    const step = Number(rec && rec.step);
    if (Number.isInteger(index) && index >= 0 && Number.isInteger(step)) out[slotId] = { index, step };
  }
  return out;
}

function emissionLimit() {
  const fixed = cfg.naming && Array.isArray(cfg.naming.fixedFiles)
    ? cfg.naming.fixedFiles.filter(Boolean)
    : [];
  const n = fixed.length || Number(cfg.screenProfile && cfg.screenProfile.requiredCount) || 0;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
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

function reorderSlots(slots, orderedSlotIds) {
  const order = [...new Set((orderedSlotIds || []).map(String).filter(Boolean))];
  const movable = new Set(order);
  const byId = new Map((slots || []).map((slot) => [String(slot.id), slot]));
  const valid = order.filter((id) => byId.has(id));
  let cursor = 0;
  return (slots || []).map((slot) => movable.has(String(slot.id)) && cursor < valid.length
    ? byId.get(valid[cursor++])
    : slot);
}

// Persiste el orden decidido en la pantalla principal sobre los bloques REALES
// de la escaleta. Reordenar solo cards.json sería temporal: materialize() lo
// sustituiría de nuevo en el siguiente ciclo del piloto.
function reorderFromCards(cardIds, options = {}) {
  ensureFiles();
  const ids = Array.isArray(cardIds) ? cardIds.map(String) : [];
  const cards = new Map(store.list().map((card) => [String(card.id), card]));
  const slotIds = ids.map((id) => cards.get(id)).filter(Boolean)
    .map((card) => card.rundownSlot).filter(Boolean).map(String);
  if (!slotIds.length) return { ok: true, persisted: false, cards: store.list() };
  const data = readJson(RUNDOWN_FILE, DEFAULT_RUNDOWN);
  upgradeRundown(data);
  data.slots = reorderSlots(data.slots || [], slotIds).map(normalizeSlot);
  data.updatedAt = new Date().toISOString();
  writeJson(RUNDOWN_FILE, data);
  // Reordenar no debe recalcular que bloques forman la emision. El endpoint ya
  // ha ordenado cards.json; aqui solo persistimos ese orden para futuros ciclos.
  return { ok: true, persisted: true, slotIds, cards: store.list() };
}

function saveLibrary(library, options = {}) {
  const next = normalizeLibrary(library);
  writeJson(LIBRARY_FILE, next);
  refreshMaterializedLibraryCards(next, options);
  return read(options);
}

function sameValue(a, b) {
  return JSON.stringify(a == null ? null : a) === JSON.stringify(b == null ? null : b);
}

function cardNeedsPatch(card, next) {
  const keys = [
    'enabled', 'type', 'template', 'theme', 'layout', 'video', 'videoIntro', 'videoOutro',
    'title', 'subtitle', 'body', 'date', 'data', 'photo', 'file', 'duration',
    'bumperKey', 'rundownLibraryKey', 'rundownWorkerKey',
  ];
  return keys.some((key) => !sameValue(card[key], next[key]));
}

function refreshMaterializedLibraryCards(library, options = {}) {
  if (options.refreshCards === false) return { updated: 0 };
  ensureFiles();
  const date = options.date || todayKey();
  const rundown = readJson(RUNDOWN_FILE, DEFAULT_RUNDOWN);
  upgradeRundown(rundown);
  const pick = pickMapFor(rundown, date);
  const autoPick = autoPickMapFor(rundown, date);
  const theme = dayTheme(date, rundown);
  let updated = 0;
  for (const slot of rundown.slots || []) {
    const s = normalizeSlot(slot);
    if (s.source !== 'library') continue;
    const current = store.list().find((card) => card.source === 'rundown' && card.rundownSlot === s.id);
    if (!current || !shouldMaterialize(s, library, date, pick, autoPick)) continue;
    const next = toCard(s, library, current.order || 999, date, pick, theme, autoPick);
    if (!cardNeedsPatch(current, next)) continue;
    store.update(current.id, { ...next, id: current.id, order: current.order || next.order });
    updated++;
  }
  return { updated };
}

function reset() {
  writeJson(RUNDOWN_FILE, DEFAULT_RUNDOWN);
  if (!fs.existsSync(LIBRARY_FILE)) writeJson(LIBRARY_FILE, DEFAULT_LIBRARY);
  return read();
}

function normalizeSlot(slot) {
  slot = slot || {};
  const hourlyByDefault = slot.source === 'library'
    && DEFAULT_HOURLY_LIBRARY_KEYS.has(slot.libraryKey)
    && !slot.rotation;
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
    type: slot.type === 'video' || slot.type === 'image' ? slot.type : 'generated',
    file: slot.file || '',
    photo: slot.photo || '',
    layout: slot.layout && typeof slot.layout === 'object' ? slot.layout : null,
    videoIntro: slot.videoIntro || '',
    videoOutro: slot.videoOutro || '',
    bumperKey: slot.bumperKey || '',
    duration: Number(slot.duration) || 8,
    video: slot.video === true,
    // Cadencia del carrusel: 'dia' (una pieza por día) u 'hora' (cambia cada hora).
    rotation: slot.source === 'library' && slot.libraryKey === 'agendaEventos'
      ? 'programada'
      : (slot.rotation === 'hora' || hourlyByDefault ? 'hora' : 'dia'),
  };
}

// Carrusel SIN repetir: recorre TODAS las piezas en orden y solo reinicia al
// agotarlas. Determinista (sin estado): el cursor avanza con el día — o con la
// hora actual si la cadencia es horaria. El offset desincroniza bloques.
function rotationStep(date, rotation) {
  return rotation === 'hora'
    ? Math.floor(Date.now() / 3600000)
    : Math.floor(Date.parse(`${date || todayKey()}T12:00:00Z`) / 86400000);
}

function pickDaily(items, key, date, rotation, autoPick) {
  if (!Array.isArray(items) || !items.length) return null;
  const step = rotationStep(date, rotation);
  if (autoPick && Number.isInteger(autoPick.index) && Number.isInteger(autoPick.step)) {
    const delta = step - autoPick.step;
    return items[((autoPick.index + delta) % items.length + items.length) % items.length];
  }
  let off = 0;
  for (const ch of String(key)) off = (off + ch.charCodeAt(0)) % 9973;
  return items[(step + off) % items.length];
}

function libraryChoice(items, key, date, rotation, pickIndex, autoPick) {
  if (!Array.isArray(items) || !items.length) return null;
  if (Number.isInteger(pickIndex) && pickIndex >= 0 && pickIndex < items.length) return items[pickIndex];
  return pickDaily(items, key, date, rotation, autoPick);
}

// Agenda no es un carrusel. La pieza visible la decide exclusivamente su
// ventana de inicio/fin; si por error hay solapes, gana la que empezó después.
function agendaChoice(items) {
  if (!Array.isArray(items) || !items.length) return null;
  const scheduled = items.filter((item) => item.startAt || item.endAt || item.start || item.end || (item.dates && item.dates.length));
  const pool = scheduled.length ? scheduled : items;
  return [...pool].sort((a, b) => String(b.startAt || b.start || '').localeCompare(String(a.startAt || a.start || '')))[0] || null;
}

function libraryPlanForSlot(slot, library, date, pickIndex, autoPick) {
  const s = normalizeSlot(slot);
  if (s.source !== 'library') return null;
  const items = libraryItems(library, s.libraryKey, date);
  const chosen = s.libraryKey === 'agendaEventos'
    ? agendaChoice(items)
    : libraryChoice(items, s.id, date, s.rotation, pickIndex, autoPick);
  const chosenIndex = chosen ? items.indexOf(chosen) : -1;
  const next = items.map((item, index) => ({
    index,
    title: item.title || item.body || '(sin titulo)',
    subtitle: item.subtitle || '',
    template: item.template || '',
    theme: item.theme || '',
    chosen: index === chosenIndex,
  }));
  return { items, chosen, chosenIndex, next };
}

function slotPayload(slot, library, date, options = {}) {
  const s = normalizeSlot(slot);
  if (s.source === 'file') {
    return {
      title: s.title || s.label,
      subtitle: s.subtitle || '',
      body: s.body || '',
      date: s.date || '',
      file: s.file || '',
      template: s.template || 'noticia',
      theme: s.theme || '',
      missing: !s.file,
    };
  }
  if (s.source === 'library') {
    const items = libraryItems(library, s.libraryKey, date);
    const item = s.libraryKey === 'agendaEventos'
      ? agendaChoice(items)
      : libraryChoice(items, s.id, date, s.rotation, options.pickIndex, options.autoPick);
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
      const workerTemplate = s.workerKey === 'airQuality'
        ? 'aire'
        : (rec.data.template || s.template || 'dato');
      return {
        title: rec.data.title,
        // La etiqueta y la fuente/fecha las mandas TÚ si las has escrito en el
        // bloque; el worker solo pone las suyas cuando están vacías. (El dato
        // vivo —título/cuerpo— sigue siendo siempre del worker.)
        subtitle: s.subtitle || rec.data.subtitle || '',
        body: rec.data.body || '',
        date: s.date || rec.data.date || '',
        // El worker sabe cuál es su mejor presentación (luz→curva, fuel→lista).
        template: workerTemplate,
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

function bumperKeysForSlot(slot, payload = {}) {
  const keys = [];
  const add = (key) => { if (key && !keys.includes(key)) keys.push(key); };
  add(slot.bumperKey || defaultBumperKeyForSlot(slot));
  if (slot.source === 'library') add(`library:${slot.libraryKey}`);
  if (slot.source === 'worker') add(`worker:${slot.workerKey}`);
  add(payload.template || slot.template);
  return keys;
}

function defaultBumperKeyForSlot(slot) {
  if (slot.source === 'library' && slot.libraryKey) return `library:${slot.libraryKey}`;
  if (slot.source === 'worker' && slot.workerKey) return `worker:${slot.workerKey}`;
  return '';
}

function bumperForSlot(slot, payload = {}) {
  const all = cfg.templateBumpers || {};
  for (const key of bumperKeysForSlot(slot, payload)) {
    const b = all[key];
    if (b && (b.intro || b.outro)) return { intro: b.intro || '', outro: b.outro || '', key };
  }
  return { intro: '', outro: '', key: '' };
}

function toCard(slot, library, order, date, pickMap = {}, dayThemeKey = '', autoPickMap = {}) {
  const s = normalizeSlot(slot);
  const p = slotPayload(s, library, date, { pickIndex: pickMap[s.id], autoPick: autoPickMap[s.id] });
  const semanticBumperKey = s.bumperKey || defaultBumperKeyForSlot(s);
  const bumper = bumperForSlot(s, p);
  const wantsVideo = s.video === true || Boolean(s.videoIntro || s.videoOutro || bumper.intro || bumper.outro);
  // La plantilla/tema fijados EN EL BLOQUE mandan sobre piezas manuales.
  // En workers con plantilla propia (luz, aire, combustible), manda el dato.
  const tplOverride = s.source === 'worker' && p.template ? '' : s.template;
  const themeOverride = s.theme;
  if (s.source === 'file') {
    return store.normalize({
      id: `rd_${s.id}`,
      order,
      enabled: s.enabled,
      type: s.type === 'image' ? 'image' : 'video',
      file: p.file || s.file || null,
      title: p.title || s.title || s.label,
      subtitle: p.subtitle || s.subtitle || '',
      body: p.body || s.body || '',
      date: p.date || s.date || '',
      duration: s.duration || p.duration || 8,
      source: 'rundown',
      slug: s.id,
      rundownSlot: s.id,
    });
  }
  return store.normalize({
    id: `rd_${s.id}`,
    order,
    enabled: s.enabled,
    type: 'generated',
    template: tplOverride ? s.template : (p.template || s.template || 'noticia'),
    // Auto significa el color de la pieza/plantilla. El color del día solo se
    // aplica cuando el usuario lo ha elegido expresamente.
    theme: themeOverride ? s.theme : (p.theme || dayThemeKey || null),
    title: p.title || s.title || s.label,
    subtitle: p.subtitle || s.subtitle || '',
    body: p.body || s.body || '',
    date: p.date || s.date || '',
    data: p.data || null,
    photo: s.photo || p.photo || null,
    layout: s.layout || null,
    duration: s.duration || p.duration || 8,
    video: wantsVideo,
    videoIntro: s.videoIntro || null,
    videoOutro: s.videoOutro || null,
    bumperKey: semanticBumperKey || null,
    rundownLibraryKey: s.libraryKey || null,
    rundownWorkerKey: s.workerKey || null,
    source: 'rundown',
    slug: s.id,
    rundownSlot: s.id,
  });
}

// ===== AGENDA EXPRÉS =====
// El flujo de cada mañana en un solo paso: texto plano, una línea por evento
// ("19:30 Concierto de jazz | Teatro Principal"). El sistema crea/actualiza
// los eventos del día en el banco y UN pase que los muestra, sin que el
// usuario toque bancos, pases ni ventanas. El exprés es el DUEÑO de los
// eventos de ese día: lo que escribas sustituye lo del día, nada más.
const QUICK_NOTES = '__expres__';

function parseQuickLine(line, day) {
  const m = String(line || '').trim().match(/^(\d{1,2})[:.hH](\d{2})\s+(.*)$/);
  const time = m ? `${String(m[1]).padStart(2, '0')}:${m[2]}` : '';
  const rest = (m ? m[3] : String(line || '').trim()).split('|').map((x) => x.trim());
  return normalizeAgendaEvent({ date: day, time, title: rest[0] || '', place: rest[1] || '', subtitle: rest[2] || '' });
}

function quickLineOf(ev) {
  return `${ev.time ? ev.time + ' ' : ''}${ev.title}${ev.place ? ' | ' + ev.place : ''}${ev.subtitle ? ' | ' + ev.subtitle : ''}`;
}

function quickAgenda(date) {
  ensureFiles();
  const day = String(date || todayKey()).slice(0, 10);
  const library = normalizeLibrary(readJson(LIBRARY_FILE, DEFAULT_LIBRARY));
  const events = (library.agendaBanco || [])
    .filter((ev) => ev.date === day)
    .sort((a, b) => String(a.time || '99:99').localeCompare(String(b.time || '99:99')));
  const data = readJson(RUNDOWN_FILE, DEFAULT_RUNDOWN);
  const quickPass = (library.agendaEventos || []).find((it) => it.notes === QUICK_NOTES && (it.dates || []).includes(day));
  const previewCard = store.list().find((c) => c.slug === 'agenda-manana');
  return {
    ok: true, date: day, lines: events.map(quickLineOf), count: events.length,
    theme: dayTheme(day, data),
    hideExpired: quickPass ? quickPass.hideExpired === true : true,
    previewToday: Boolean(previewCard && previewCard.enabled !== false),
  };
}

function quickAgendaSave(date, text, options = {}) {
  ensureFiles();
  const day = String(date || todayKey()).slice(0, 10);
  const library = normalizeLibrary(readJson(LIBRARY_FILE, DEFAULT_LIBRARY));
  // Los eventos del día se sustituyen por lo escrito (el exprés manda ese día).
  library.agendaBanco = (library.agendaBanco || []).filter((ev) => ev.date !== day);
  const events = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    .map((l) => parseQuickLine(l, day)).filter((ev) => ev.title);
  library.agendaBanco.push(...events);
  // Un único pase exprés para ese día (los pases hechos a mano no se tocan y,
  // si existen, ganan: empiezan más tarde que las 00:00 del exprés).
  library.agendaEventos = (library.agendaEventos || []).filter((it) => !(it.notes === QUICK_NOTES && (it.dates || []).includes(day)));
  if (events.length) {
    const tomorrow = new Date(Date.parse(`${todayKey()}T12:00:00`) + 86400000).toISOString().slice(0, 10);
    const label = day === todayKey() ? 'Hoy' : (day === tomorrow ? 'Mañana' : new Date(`${day}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' }));
    library.agendaEventos.push(normalizeLibraryItem({
      title: 'Agenda',
      subtitle: label.charAt(0).toUpperCase() + label.slice(1),
      template: 'agenda',
      theme: 'blanco',
      dates: [day],
      startAt: `${day}T00:00`,
      endAt: `${day}T23:59`,
      eventIds: events.map((ev) => ev.id),
      notes: QUICK_NOTES,
      showEventDates: false,
      hideExpired: options.hideExpired !== false,
    }, { key: 'agendaEventos', template: 'agenda', theme: 'blanco' }));
  }
  writeJson(LIBRARY_FILE, library);
  // Color del día, si se ha tocado en el mismo formulario.
  if (options.theme !== undefined) {
    const data = readJson(RUNDOWN_FILE, DEFAULT_RUNDOWN);
    upgradeRundown(data);
    if (!data.days || typeof data.days !== 'object') data.days = {};
    const rec = data.days[day] && typeof data.days[day] === 'object' ? data.days[day] : {};
    if (options.theme) rec.theme = String(options.theme); else delete rec.theme;
    data.days[day] = rec;
    data.days = cleanDays(data.days);
    data.updatedAt = new Date().toISOString();
    writeJson(RUNDOWN_FILE, data);
  }
  // CARTELA «AGENDA DE MAÑANA» visible HOY: cartela manual con caducidad
  // esta noche (23:59). Al expirar sale sola de la emisión (vigilante de
  // franjas) y, si vuelves a guardar la agenda de mañana, se actualiza.
  const tomorrowKey = new Date(Date.parse(`${todayKey()}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
  if (day === tomorrowKey && options.previewToday !== undefined) {
    const existing = store.list().find((c) => c.slug === 'agenda-manana');
    if (options.previewToday && events.length) {
      const lines = events
        .map((ev) => [ev.time, ev.title, [ev.subtitle, ev.place].map((x) => String(x || '').trim()).filter(Boolean).join(' · ')].filter(Boolean).join(' | '))
        .join('\n');
      const patch = {
        type: 'generated', template: 'agenda', theme: 'blanco',
        title: 'AGENDA', subtitle: 'MAÑANA', body: lines,
        enabled: true, source: 'manual', slug: 'agenda-manana', duration: 10,
        schedule: { startAt: '', endAt: `${todayKey()}T23:59`, dailyFrom: '', dailyTo: '' },
      };
      if (existing) store.update(existing.id, patch);
      else store.add({ ...patch, order: 900 });
    } else if (existing) {
      store.remove(existing.id);
    }
  }
  refreshMaterializedLibraryCards(library, { date: day });
  return { ok: true, date: day, count: events.length };
}

// ===== Conversión CARTELA-PRIMERO =====
// El usuario piensa en cartelas, no en bloques: "esta posición ahora es el
// tiempo", "esta ahora la escribo yo", "esta rota fotos cada hora". Esta
// función hace la fontanería del guion por debajo sin que el usuario tenga
// que abrir la Escaleta.
function convertCard(cardId, spec = {}) {
  ensureFiles();
  const card = store.list().find((c) => c.id === cardId);
  if (!card) return { ok: false, error: 'La cartela no existe' };
  const to = spec.to === 'worker' || spec.to === 'library' ? spec.to : 'manual';
  if (to === 'worker' && !String(spec.workerKey || '').trim()) return { ok: false, error: 'Falta el dato automático (workerKey)' };
  if (to === 'library' && !String(spec.libraryKey || '').trim()) return { ok: false, error: 'Falta el carrusel (libraryKey)' };
  const data = readJson(RUNDOWN_FILE, DEFAULT_RUNDOWN);
  upgradeRundown(data);
  const day = todayKey();
  const library = normalizeLibrary(readJson(LIBRARY_FILE, DEFAULT_LIBRARY));
  const theme = dayTheme(day, data);

  const refreshFromSlot = (s) => {
    const next = toCard(s, library, card.order || 999, day, {}, theme, {});
    store.update(card.id, { ...next, id: card.id, order: card.order || next.order });
  };

  // La cartela ya es del guion: se transforma SU bloque en el sitio.
  if (card.source === 'rundown' && card.rundownSlot) {
    const idx = (data.slots || []).findIndex((s) => String(s.id) === String(card.rundownSlot));
    if (to === 'manual') {
      // Congela el contenido visible como cartela manual; el bloque desaparece.
      if (idx >= 0) data.slots.splice(idx, 1);
      data.updatedAt = new Date().toISOString();
      writeJson(RUNDOWN_FILE, data);
      store.update(card.id, { source: 'manual', rundownSlot: null, rundownLibraryKey: null, rundownWorkerKey: null });
      return { ok: true, mode: 'manual', cardId: card.id };
    }
    if (idx < 0) return { ok: false, error: 'El bloque de esta cartela ya no existe; conviértela primero a manual' };
    const s = normalizeSlot(data.slots[idx]);
    s.source = to;
    s.workerKey = to === 'worker' ? String(spec.workerKey) : '';
    s.libraryKey = to === 'library' ? String(spec.libraryKey) : '';
    s.template = ''; // el contenido nuevo manda; el usuario puede fijarla después
    if (spec.rotation === 'hora' || spec.rotation === 'dia') s.rotation = spec.rotation;
    if (spec.label) s.label = String(spec.label);
    data.slots[idx] = normalizeSlot(s);
    data.updatedAt = new Date().toISOString();
    writeJson(RUNDOWN_FILE, data);
    refreshFromSlot(data.slots[idx]);
    return { ok: true, mode: to, cardId: card.id, slotId: s.id };
  }

  // Cartela manual → automática/carrusel: nace un bloque en su posición.
  if (to === 'manual') return { ok: true, mode: 'manual', cardId: card.id }; // ya lo es
  const slotId = 'blk_' + String(card.id).replace(/[^a-z0-9]/gi, '').slice(-10);
  if ((data.slots || []).some((s) => String(s.id) === slotId)) return { ok: false, error: 'Ya existe un bloque para esta cartela' };
  const meta = to === 'library' ? LIBRARY_KEYS.find((k) => k.key === spec.libraryKey) : null;
  const s = normalizeSlot({
    id: slotId,
    label: String(spec.label || (meta && meta.label) || card.title || 'Bloque'),
    enabled: card.enabled !== false,
    source: to,
    workerKey: to === 'worker' ? String(spec.workerKey) : '',
    libraryKey: to === 'library' ? String(spec.libraryKey) : '',
    theme: card.theme || '',
    duration: Number(card.duration) || 8,
    video: card.video === true,
    rotation: spec.rotation === 'dia' ? 'dia' : (spec.rotation === 'hora' ? 'hora' : undefined),
  });
  // Se inserta en el guion respetando la posición visible de la cartela.
  const before = store.active().filter((c) => c.source === 'rundown' && (c.order || 0) < (card.order || 0)).length;
  data.slots.splice(Math.min(before, data.slots.length), 0, s);
  data.updatedAt = new Date().toISOString();
  writeJson(RUNDOWN_FILE, data);
  refreshFromSlot(s);
  return { ok: true, mode: to, cardId: card.id, slotId };
}

function rememberCardEdit(card, patch = {}) {
  if (!card || card.source !== 'rundown' || !card.rundownSlot) return null;
  ensureFiles();
  const data = readJson(RUNDOWN_FILE, DEFAULT_RUNDOWN);
  upgradeRundown(data);
  const slot = (data.slots || []).find((s) => String(s.id) === String(card.rundownSlot));
  if (!slot) return null;
  const source = slot.source || card.source;
  const setIfPresent = (key, value) => {
    if (Object.prototype.hasOwnProperty.call(patch, key)) slot[key] = value;
  };

  setIfPresent('enabled', card.enabled !== false);
  setIfPresent('template', card.template || '');
  setIfPresent('theme', card.theme || '');
  setIfPresent('photo', card.photo || '');
  setIfPresent('layout', card.layout || null);
  setIfPresent('duration', Number(card.duration) || 8);
  setIfPresent('video', card.video === true);
  setIfPresent('videoIntro', card.videoIntro || '');
  setIfPresent('videoOutro', card.videoOutro || '');
  setIfPresent('bumperKey', card.bumperKey || slot.bumperKey || '');
  if (source === 'file') {
    setIfPresent('type', card.type === 'image' ? 'image' : 'video');
    setIfPresent('file', card.file || '');
  }
  // En carruseles y workers, el contenido vivo manda; se conserva la
  // presentación. En bloques manuales, el contenido editado también es parte
  // del bloque y debe sobrevivir al piloto.
  if (source !== 'library' && source !== 'worker') {
    setIfPresent('title', card.title || '');
    setIfPresent('subtitle', card.subtitle || '');
    setIfPresent('body', card.body || '');
    setIfPresent('date', card.date || '');
  }
  // En workers, la ETIQUETA (chip) y la FUENTE/FECHA sí son tuyas: se guardan
  // en el bloque y el siguiente pase las respeta (el dato vivo no se toca).
  if (source === 'worker') {
    setIfPresent('subtitle', card.subtitle || '');
    setIfPresent('date', card.date || '');
  }

  data.slots = (data.slots || []).map(normalizeSlot);
  data.updatedAt = new Date().toISOString();
  writeJson(RUNDOWN_FILE, data);
  return read();
}

function rememberCardDelete(card, date) {
  if (!card || card.source !== 'rundown' || !card.rundownSlot) return null;
  const day = String(date || todayKey()).slice(0, 10);
  ensureFiles();
  const data = readJson(RUNDOWN_FILE, DEFAULT_RUNDOWN);
  upgradeRundown(data);
  const slotId = String(card.rundownSlot);
  const slot = (data.slots || []).find((s) => String(s.id) === slotId);
  if (!slot) return null;
  if (!data.days || typeof data.days !== 'object') data.days = {};
  const rec = data.days[day] && typeof data.days[day] === 'object' ? data.days[day] : {};
  const skip = Array.isArray(rec.skip) ? rec.skip.map(String) : [];
  if (!skip.includes(slotId)) skip.push(slotId);
  rec.skip = skip;
  data.days[day] = rec;
  return save(data, { date: day });
}

function isEmptyManualNewsSlot(slot) {
  const s = normalizeSlot(slot);
  if (s.source !== 'fixed' || s.type !== 'generated' || s.template !== 'noticia') return false;
  const title = String(s.title || '').trim();
  const label = String(s.label || '').trim();
  const subtitle = String(s.subtitle || '').trim();
  const placeholderTitle = !title
    || title.toLocaleLowerCase('es') === label.toLocaleLowerCase('es')
    || /^noticia propia(?:\s*[-·|]\s*manual)?(?:\s+gasteizberri(?:\.com)?)?$/i.test(title);
  const genericSubtitle = !subtitle || /^gasteizberri(?:\.com)?$/i.test(subtitle);
  return placeholderTitle
    && genericSubtitle
    && !String(s.body || '').trim()
    && !String(s.date || '').trim()
    && !String(s.photo || '').trim();
}

function shouldMaterialize(slot, library, date, pickMap = {}, autoPickMap = {}) {
  const s = normalizeSlot(slot);
  if (s.enabled === false) return false;
  if (isEmptyManualNewsSlot(s)) return false;
  if (s.source === 'library' && s.libraryKey === 'agendaEventos') {
    const p = slotPayload(s, library, date, { pickIndex: pickMap[s.id], autoPick: autoPickMap[s.id] });
    return Boolean(!p.missing && (p.title || p.body));
  }
  // Foto GasteizBerri: sin foto elegida no hay nada que emitir (nada de
  // cartelas "pendiente" en pantalla).
  if (s.source === 'library' && s.libraryKey === 'fotosGasteizberri') {
    const p = slotPayload(s, library, date, { pickIndex: pickMap[s.id], autoPick: autoPickMap[s.id] });
    return Boolean(!p.missing && p.photo);
  }
  return true;
}

function report(rundown, library, date) {
  const skip = skipSetFor(rundown, date);
  const pick = pickMapFor(rundown, date);
  const autoPick = autoPickMapFor(rundown, date);
  const limit = emissionLimit();
  let emissionOrder = 0;
  return (rundown.slots || []).map((slot, i) => {
    const s = normalizeSlot(slot);
    const p = slotPayload(s, library, date, { pickIndex: pick[s.id], autoPick: autoPick[s.id] });
    const plan = libraryPlanForSlot(s, library, date, pick[s.id], autoPick[s.id]);
    const skippedToday = skip.has(s.id);
    const emptyManualNews = isEmptyManualNewsSlot(s);
    const agendaSkipped = s.source === 'library' && s.libraryKey === 'agendaEventos' && (p.missing || (!p.title && !p.body));
    const fotoSkipped = s.source === 'library' && s.libraryKey === 'fotosGasteizberri' && (p.missing || !p.photo);
    const autoSkipped = emptyManualNews || agendaSkipped || fotoSkipped;
    const missing = s.enabled && !skippedToday && !autoSkipped && (p.missing || !p.title);
    const eligible = !skippedToday && shouldMaterialize(s, library, date, pick, autoPick);
    let inEmission = false;
    let slotEmissionOrder = null;
    if (eligible) {
      emissionOrder++;
      inEmission = !limit || emissionOrder <= limit;
      slotEmissionOrder = emissionOrder;
    }
    return {
      id: s.id,
      order: i + 1,
      emissionOrder: slotEmissionOrder,
      inEmission,
      omitted: Boolean(eligible && !inEmission),
      label: s.label,
      enabled: s.enabled,
      source: s.source,
      libraryKey: s.libraryKey,
      workerKey: s.workerKey,
      template: p.template || s.template || '',
      title: p.title || '',
      subtitle: p.subtitle || '',
      missing: Boolean(missing),
      autoSkipped,
      skippedToday,
      note: emptyManualNews
        ? 'Noticia vacia: anade contenido para incluirla'
        : (agendaSkipped ? 'Sin agenda activa para este momento'
        : (fotoSkipped ? 'Sin fotos en el banco: elige fotos de la web'
        : (missing ? (s.source === 'worker' ? `Pendiente worker: ${s.workerKey}` : (s.source === 'file' ? 'Falta seleccionar el archivo MP4' : 'Pendiente de contenido')) : ''))),
      chosenIndex: plan ? plan.chosenIndex : null,
      manualPick: Object.prototype.hasOwnProperty.call(pick, s.id),
      autoPick: Object.prototype.hasOwnProperty.call(autoPick, s.id),
      rotation: s.rotation,
      choices: plan ? plan.next : [],
    };
  });
}

function materialize(options = {}) {
  const { rundown, library, activeDate, report: rep } = read(options);
  const skip = skipSetFor(rundown, activeDate);
  const pick = pickMapFor(rundown, activeDate);
  const autoPick = autoPickMapFor(rundown, activeDate);
  const eligible = (rundown.slots || []).filter((s) => !skip.has(String(s.id)) && shouldMaterialize(s, library, activeDate, pick, autoPick));
  const limit = emissionLimit();
  const active = limit ? eligible.slice(0, limit) : eligible;
  const omitted = limit && eligible.length > limit
    ? eligible.slice(limit).map((s) => ({ id: String(s.id), label: String(s.label || s.id || '') }))
    : [];
  const theme = dayTheme(activeDate, rundown);
  const generated = active.map((slot, i) => toCard(slot, library, i + 1, activeDate, pick, theme, autoPick));
  const manual = store.list()
    .filter((card) => card.source !== 'rundown')
    .map((card, i) => ({ ...card, order: generated.length + i + 1 }));
  store.save({ cards: [...generated, ...manual] });
  return { ok: true, count: generated.length, requiredCount: limit || undefined, omitted, cards: generated, report: rep };
}

function pick(date, slotId, itemIndex, options = {}) {
  const day = String(date || todayKey()).slice(0, 10);
  const data = readJson(RUNDOWN_FILE, DEFAULT_RUNDOWN);
  upgradeRundown(data);
  if (!data.days || typeof data.days !== 'object') data.days = {};
  const rec = data.days[day] && typeof data.days[day] === 'object' ? data.days[day] : {};
  const picks = rec.pick && typeof rec.pick === 'object' ? rec.pick : {};
  const autoPicks = rec.autoPick && typeof rec.autoPick === 'object' ? rec.autoPick : {};
  const slot = (data.slots || []).map(normalizeSlot).find((s) => String(s.id) === String(slotId));
  const n = Number(itemIndex);
  if (Number.isInteger(n) && n >= 0) {
    if (options.fixed !== false) {
      picks[String(slotId)] = n;
      delete autoPicks[String(slotId)];
    } else {
      delete picks[String(slotId)];
      autoPicks[String(slotId)] = { index: n, step: rotationStep(day, slot ? slot.rotation : 'dia') };
    }
  } else {
    delete picks[String(slotId)];
    delete autoPicks[String(slotId)];
  }
  rec.pick = picks;
  rec.autoPick = autoPicks;
  data.days[day] = rec;
  return save(data, { date: day });
}

module.exports = { read, save, saveLibrary, reset, materialize, pick, reorderSlots, reorderFromCards, isEmptyManualNewsSlot, rememberCardEdit, rememberCardDelete, convertCard, quickAgenda, quickAgendaSave, dayTheme, RUNDOWN_FILE, LIBRARY_FILE };
