'use strict';
// WORKERS INTERNOS: datos automáticos reales para los bloques "worker" de la
// escaleta, sin depender de procesos externos. Cada proveedor consulta una API
// pública gratuita y deja el resultado en data/worker-data.json (caché).
// La escaleta lee esa caché de forma síncrona al materializar.
const fs = require('fs');
const path = require('path');
const log = require('./util/logger');
const { writeJsonAtomic } = require('./util/atomicWrite');

const DATA_FILE = path.join(__dirname, '..', 'data', 'worker-data.json');
const MAX_AGE_MS = 3 * 60 * 60 * 1000; // un dato de más de 3h se considera caducado

// Vitoria-Gasteiz
const LAT = 42.8467, LON = -2.6716;

function loadAll() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return {}; }
}

function saveAll(data) {
  writeJsonAtomic(DATA_FILE, data);
}

async function fetchJson(url) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 10000);
  try {
    const r = await fetch(url, { signal: c.signal, headers: { 'user-agent': 'PantallaBot (gasteizberri)' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

// --- Proveedor: tiempo en Vitoria (Open-Meteo, gratis, sin clave) ---
const WMO = [
  [[0], 'Despejado'], [[1, 2], 'Poco nuboso'], [[3], 'Nublado'],
  [[45, 48], 'Niebla'], [[51, 53, 55, 56, 57], 'Llovizna'],
  [[61, 63, 65, 66, 67, 80, 81, 82], 'Lluvia'], [[71, 73, 75, 77, 85, 86], 'Nieve'],
  [[95, 96, 99], 'Tormenta'],
];
function wmoLabel(code) {
  for (const [codes, label] of WMO) if (codes.includes(code)) return label;
  return 'Variable';
}

async function weather() {
  const j = await fetchJson(
    `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
    `&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=Europe%2FMadrid&forecast_days=1`
  );
  const t = Math.round(j.current.temperature_2m);
  const max = Math.round(j.daily.temperature_2m_max[0]);
  const min = Math.round(j.daily.temperature_2m_min[0]);
  return {
    template: 'clima',
    title: `${t}º`,
    subtitle: wmoLabel(Number(j.current.weather_code)),
    body: `Máx ${max}º · Mín ${min}º`,
    date: 'Vitoria-Gasteiz',
  };
}

// --- Proveedor: precio de la luz PVPC (REE apidatos, gratis, sin clave) ---
async function powerPrice() {
  const now = new Date();
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const j = await fetchJson(
    `https://apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real` +
    `?time_trunc=hour&start_date=${day}T00:00&end_date=${day}T23:59`
  );
  const serie = (j.included || []).find((s) => /pvpc/i.test((s.attributes && s.attributes.title) || '')) || (j.included || [])[0];
  const values = ((serie && serie.attributes && serie.attributes.values) || [])
    .map((v) => ({ eurMWh: Number(v.value), at: new Date(v.datetime) }));
  if (!values.length) throw new Error('sin datos PVPC');
  const hour = now.getHours();
  const cur = values.find((v) => v.at.getHours() === hour) || values[values.length - 1];
  const cheap = values.reduce((m, v) => (v.eurMWh < m.eurMWh ? v : m), values[0]);
  const exp = values.reduce((m, v) => (v.eurMWh > m.eurMWh ? v : m), values[0]);
  const cts = (e) => (e / 10).toFixed(1).replace('.', ',');
  return {
    template: 'luz', // curva del día con la hora más barata señalada
    title: `${cts(cur.eurMWh)} cts`,
    subtitle: 'Precio de la luz',
    body: `Hora más barata hoy: ${String(cheap.at.getHours()).padStart(2, '0')}:00 (${cts(cheap.eurMWh)} cts)`,
    date: 'kWh · PVPC · REE',
    extra: {
      series: values.map((v) => ({ h: v.at.getHours(), v: Math.round(v.eurMWh / 10 * 10) / 10 })),
      cheap: { h: cheap.at.getHours(), v: Math.round(cheap.eurMWh / 10 * 10) / 10 },
      exp: { h: exp.at.getHours(), v: Math.round(exp.eurMWh / 10 * 10) / 10 },
      now: { h: hour, v: Math.round(cur.eurMWh / 10 * 10) / 10 },
    },
  };
}

// --- Proveedor: gasolineras más baratas de Vitoria (MITECO, gratis, sin clave) ---
async function fuel() {
  const j = await fetchJson('https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/FiltroProvincia/01');
  const num = (s) => { const v = parseFloat(String(s || '').replace(',', '.')); return isFinite(v) && v > 0 ? v : null; };
  const st = (j.ListaEESSPrecio || [])
    .filter((e) => String(e['Municipio'] || '').toUpperCase().includes('VITORIA'))
    .map((e) => ({
      name: String(e['Rótulo'] || '').trim(),
      addr: String(e['Dirección'] || '').trim(),
      g95: num(e['Precio Gasolina 95 E5']),
      goa: num(e['Precio Gasoleo A']),
    }))
    .filter((s) => s.g95);
  if (!st.length) throw new Error('sin gasolineras de Vitoria en la respuesta');
  st.sort((a, b) => a.g95 - b.g95);
  const top = st.slice(0, 3);
  const f = (v) => v.toFixed(3).replace('.', ',');
  return {
    template: 'gasolina',
    title: `${f(top[0].g95)} €`,
    subtitle: 'Gasolina 95 · la más barata',
    body: `${top[0].name} · ${top[0].addr}`,
    date: 'Precios oficiales · MITECO',
    extra: { stations: top },
  };
}

const PROVIDERS = {
  weather: { label: 'El tiempo (Open-Meteo)', fn: weather },
  powerPrice: { label: 'Precio de la luz (REE)', fn: powerPrice },
  fuel: { label: 'Gasolineras Vitoria (MITECO)', fn: fuel },
  // poolCapacity: sin fuente pública estable; se rellena a mano o por archivo
  // en data/worker-inbox. Añadir proveedor aquí cuando haya API.
};

// Dato cacheado y vigente para una clave (lectura síncrona).
function get(key) {
  const all = loadAll();
  const rec = all[key];
  if (!rec || !rec.data) return null;
  if (Date.now() - Date.parse(rec.at) > MAX_AGE_MS) return null;
  return rec;
}

// Refresca todos los proveedores conocidos. Nunca lanza: registra fallos.
async function refreshAll() {
  const all = loadAll();
  const results = {};
  for (const [key, p] of Object.entries(PROVIDERS)) {
    try {
      const data = await p.fn();
      all[key] = { data, at: new Date().toISOString(), ok: true };
      results[key] = { ok: true };
    } catch (e) {
      results[key] = { ok: false, error: e.message };
      log.warn('workers', `Worker ${key} falló: ${e.message} (se mantiene el dato anterior si existe)`);
    }
  }
  saveAll(all);
  const okCount = Object.values(results).filter((r) => r.ok).length;
  log.info('workers', `Datos automáticos: ${okCount}/${Object.keys(PROVIDERS).length} actualizados`);
  return { results, state: state() };
}

// Estado para el panel.
function state() {
  const all = loadAll();
  return Object.keys(PROVIDERS).map((key) => {
    const rec = all[key] || null;
    const fresh = Boolean(rec && rec.at && Date.now() - Date.parse(rec.at) <= MAX_AGE_MS);
    return {
      key,
      label: PROVIDERS[key].label,
      fresh,
      at: rec ? rec.at : null,
      preview: rec && rec.data ? `${rec.data.title} · ${rec.data.subtitle}` : null,
    };
  });
}

let _timer = null;
function start() {
  if (_timer) return;
  refreshAll().catch(() => {});
  _timer = setInterval(() => { refreshAll().catch(() => {}); }, 30 * 60000); // cada 30 min
  if (_timer.unref) _timer.unref();
}

module.exports = { get, refreshAll, state, start, PROVIDERS };
