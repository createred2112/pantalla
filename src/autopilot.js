'use strict';
// PILOTO AUTOMÁTICO: cada día, a la hora configurada, genera la escaleta del
// día y publica a la pantalla. Sin intervención humana: la persona solo entra
// al panel cuando hay última hora o quiere retocar contenido.
const { cfg, saveConfig } = require('./config');
const log = require('./util/logger');
const status = require('./util/status');

let _timer = null;
let _running = false;

function conf() {
  return Object.assign({ enabled: false, time: '08:00', publish: true }, cfg.autopilot || {});
}

function setConf(partial) {
  const next = Object.assign(conf(), partial || {});
  if (!/^\d{1,2}:\d{2}$/.test(String(next.time))) next.time = '08:00';
  next.enabled = next.enabled === true;
  next.publish = next.publish !== false;
  saveConfig({ autopilot: next });
  return conf();
}

function state() {
  const st = status.read();
  return (st.stages && st.stages.autopilot) || null;
}

// Fecha local del servidor (YYYY-MM-DD).
function localDay(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function run(day, c, opts = {}) {
  const publishNow = opts.publish === true;
  log.info('autopilot', `${opts.scheduled ? 'Piloto automático' : 'Preparación manual'}: escaleta del ${day}${publishNow ? '' : ' (sin publicar: revisar antes)'}`);
  // Datos frescos de los workers ANTES de materializar (tiempo, luz...).
  try { await require('./workers').refreshAll(); } catch {}
  const r = require('./rundown').materialize({ date: day });
  let pub = null;
  if (publishNow) {
    pub = await require('./pipeline/publish').publish({ dryRun: false, skipImport: false });
  } else {
    // Solo renderiza (con caché): deja las cartelas listas para REVISAR.
    try { await require('./pipeline/generate').generate(); } catch (e) { log.warn('autopilot', 'Fallo al renderizar: ' + e.message); }
  }
  const ok = Boolean(r.ok !== false && (!pub || pub.ok));
  // Solo la ejecución PROGRAMADA marca el día como hecho: la preparación
  // manual no debe impedir que el piloto corra a su hora.
  if (opts.scheduled) {
    const prev = state();
    const attempts = ok ? 0 : ((prev && prev.day === day ? Number(prev.attempts || 0) : 0) + 1);
    status.set('autopilot', { ok, day, cards: r.count, published: Boolean(pub && pub.ok), attempts });
  }
  log[ok ? 'info' : 'warn']('autopilot',
    `${opts.scheduled ? 'Piloto automático' : 'Preparación'} ${ok ? 'OK' : 'con fallos'}: ${r.count} cartela(s)` +
    (pub ? (pub.ok ? ' · publicado en pantalla' : ' · FALLO al publicar (mira el log)') : ' · pendiente de revisión y publicación manual'));
  return { ok, day, cards: r.count, published: Boolean(pub && pub.ok), prepared: !publishNow };
}

async function tick() {
  const c = conf();
  if (!c.enabled || _running) return;
  const now = new Date();
  const day = localDay(now);
  const last = state();
  if (last && last.day === day) {
    if (last.ok !== false) return; // hoy ya se ejecutó bien
    // Falló (p. ej. FTP caído): reintenta cada 30 min, máximo 3 intentos.
    if (Number(last.attempts || 1) >= 3) return;
    if (Date.now() - Date.parse(last.ts || 0) < 30 * 60000) return;
  }
  const [hh, mm] = String(c.time).split(':').map(Number);
  if (now.getHours() * 60 + now.getMinutes() < hh * 60 + mm) return; // aún no es la hora
  _running = true;
  try {
    await run(day, c, { publish: c.publish !== false, scheduled: true });
  } catch (e) {
    const prev = state();
    const attempts = (prev && prev.day === day ? Number(prev.attempts || 0) : 0) + 1;
    status.set('autopilot', { ok: false, day, error: e.message, attempts });
    log.error('autopilot', `Fallo del piloto automático (intento ${attempts}/3): ` + e.message);
  } finally {
    _running = false;
  }
}

// Ejecución manual inmediata desde el panel. Por defecto PREPARA (datos +
// escaleta + render) sin publicar: la publicación pasa por revisión humana.
async function runNow(opts = {}) {
  if (_running) throw new Error('el piloto ya está ejecutándose');
  _running = true;
  try { return await run(localDay(), conf(), { publish: opts.publish === true }); }
  finally { _running = false; }
}

function start() {
  if (_timer) return;
  _timer = setInterval(() => { tick().catch(() => {}); }, 30000);
  if (_timer.unref) _timer.unref();
  const c = conf();
  log.info('autopilot', c.enabled
    ? `Piloto automático ACTIVO: escaleta + publicación cada día a las ${c.time}`
    : 'Piloto automático apagado (actívalo desde el panel)');
}

module.exports = { start, conf, setConf, state, tick, runNow };
