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

async function run(day, c) {
  log.info('autopilot', `Piloto automático: generando la escaleta del ${day}`);
  // Datos frescos de los workers ANTES de materializar (tiempo, luz...).
  try { await require('./workers').refreshAll(); } catch {}
  const r = require('./rundown').materialize({ date: day });
  let pub = null;
  if (c.publish !== false) {
    pub = await require('./pipeline/publish').publish({ dryRun: false, skipImport: false });
  }
  const ok = Boolean(r.ok !== false && (!pub || pub.ok));
  status.set('autopilot', { ok, day, cards: r.count, published: Boolean(pub && pub.ok) });
  log[ok ? 'info' : 'warn']('autopilot',
    `Piloto automático ${ok ? 'OK' : 'con fallos'}: ${r.count} cartela(s)` +
    (pub ? (pub.ok ? ' · publicado en pantalla' : ' · FALLO al publicar (mira el log)') : ' · sin publicar (desactivado)'));
  return { ok, day, cards: r.count, published: Boolean(pub && pub.ok) };
}

async function tick() {
  const c = conf();
  if (!c.enabled || _running) return;
  const now = new Date();
  const day = localDay(now);
  const last = state();
  if (last && last.day === day) return; // hoy ya se ejecutó
  const [hh, mm] = String(c.time).split(':').map(Number);
  if (now.getHours() * 60 + now.getMinutes() < hh * 60 + mm) return; // aún no es la hora
  _running = true;
  try {
    await run(day, c);
  } catch (e) {
    status.set('autopilot', { ok: false, day, error: e.message });
    log.error('autopilot', 'Fallo del piloto automático: ' + e.message);
  } finally {
    _running = false;
  }
}

// Ejecución manual inmediata (botón "Probar ahora" del panel).
async function runNow() {
  if (_running) throw new Error('el piloto ya está ejecutándose');
  _running = true;
  try { return await run(localDay(), conf()); }
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
