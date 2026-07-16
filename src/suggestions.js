'use strict';
// SUGERENCIAS PARA LOS BANCOS ("proponme piezas"): frases, datos curiosos,
// datos útiles y efemérides que el usuario añade con un toque.
//
// COSTE PARA EL SERVIDOR: prácticamente CERO y sin picos, por diseño.
//  - No hay sondeos, ni cron, ni tareas de fondo: SOLO responde cuando el
//    usuario pulsa el botón en el panel.
//  - Frases y datos salen de archivos locales (assets/seeds/*.json): coste 0.
//  - Efemérides: UNA llamada a la API de Wikipedia como máximo AL DÍA
//    (se cachea en data/efemerides-cache.json); el resto del día, disco.
//  - La rotación diaria de sugerencias es determinista (sin estado ni CPU).
const fs = require('fs');
const path = require('path');
const { paths, abs } = require('./config');
const log = require('./util/logger');

const SEEDS = {
  citasHistoricas: 'citas.json',
  datosCuriosos: 'datos-curiosos.json',
  datosUtiles: 'datos-utiles.json',
};
const EFEM_CACHE = path.join(path.dirname(paths.data), 'efemerides-cache.json');

function readSeed(name) {
  try {
    const d = JSON.parse(fs.readFileSync(abs('assets/seeds/' + name), 'utf8'));
    return Array.isArray(d) ? d : [];
  } catch { return []; }
}

// Barajado determinista por día: las sugerencias varían cada día sin
// necesidad de guardar estado ni de trabajo de fondo.
function dailyShuffle(arr, salt = '') {
  const day = new Date().toLocaleDateString('sv-SE') + salt;
  let seed = 0;
  for (const ch of day) seed = ((seed * 31) + ch.charCodeAt(0)) >>> 0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function clean(s, max = 170) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}

// Efemérides de "tal día como hoy" (Wikipedia en español), cacheadas por día.
async function efemerides() {
  const today = new Date().toLocaleDateString('sv-SE');
  try {
    const cache = JSON.parse(fs.readFileSync(EFEM_CACHE, 'utf8'));
    if (cache.date === today && Array.isArray(cache.items)) return { items: cache.items, source: 'Wikipedia (caché de hoy)' };
  } catch {}
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const r = await fetch(`https://es.wikipedia.org/api/rest_v1/feed/onthisday/events/${mm}/${dd}`, {
    headers: { accept: 'application/json', 'user-agent': 'la-pantalla-gasteizberri/1.0' },
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new Error('Wikipedia respondió ' + r.status);
  const j = await r.json();
  const items = (j.events || [])
    .filter((ev) => ev && ev.year && ev.text)
    .map((ev) => ({
      title: clean(`${ev.year}: ${ev.text}`),
      subtitle: 'Tal día como hoy',
      body: '',
      date: 'Efemérides · Wikipedia',
    }))
    .slice(0, 15);
  try { fs.writeFileSync(EFEM_CACHE, JSON.stringify({ date: today, items })); } catch {}
  log.info('suggest', `Efemérides del ${dd}/${mm} traídas de Wikipedia y cacheadas (${items.length})`);
  return { items, source: 'Wikipedia' };
}

// Sugerencias para un banco, excluyendo lo que ya tienes.
async function suggest(key, existingTitles = []) {
  const have = new Set(existingTitles.map((t) => String(t || '').trim().toLowerCase()).filter(Boolean));
  const notMine = (it) => !have.has(String(it.title || '').trim().toLowerCase());
  if (key === 'efemerides') {
    const r = await efemerides();
    return { ok: true, key, source: r.source, items: r.items.filter(notMine).slice(0, 12) };
  }
  const seedFile = SEEDS[key];
  if (!seedFile) return { ok: false, error: 'Este banco no tiene sugerencias' };
  const items = dailyShuffle(readSeed(seedFile).filter(notMine), key).slice(0, 12);
  return { ok: true, key, source: 'banco de ideas local', items };
}

// ===== KULTURKLIK / Open Data Euskadi: agenda cultural de Vitoria-Gasteiz =====
// UNA descarga al día por fecha (hoy/mañana), cacheada en disco. Se dispara
// SOLO al abrir la Agenda exprés: sin sondeos ni tareas de fondo.
const KK_CACHE = path.join(path.dirname(paths.data), 'kulturklik-cache.json');
const KK_MAX_PAGES = 6;

function kkTime(hours) {
  const m = String(hours || '').match(/(\d{1,2})[:.](\d{2})/);
  return m ? `${String(m[1]).padStart(2, '0')}:${m[2]}` : '';
}

async function kulturklik(dateStr) {
  const day = String(dateStr || '').slice(0, 10) || new Date().toLocaleDateString('sv-SE');
  const today = new Date().toLocaleDateString('sv-SE');
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(KK_CACHE, 'utf8')) || {}; } catch {}
  const hit = cache[day];
  if (hit && hit.fetchedOn === today && Array.isArray(hit.items)) {
    return { ok: true, cached: true, date: day, items: hit.items };
  }
  const [y, m, d] = day.split('-');
  const items = [];
  const seen = new Set();
  for (let page = 1; page <= KK_MAX_PAGES; page++) {
    const u = `https://api.euskadi.eus/culture/events/v1.0/events/byDate/${y}/${m}/${d}?_elements=100&_page=${page}`;
    const r = await fetch(u, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error('Kulturklik respondió ' + r.status);
    const j = await r.json();
    for (const ev of j.items || []) {
      if (!/vitoria/i.test(String(ev.municipalityEs || ''))) continue;
      const title = clean(String(ev.nameEs || ev.nameEu || '').replace(/^"|"$/g, ''), 110);
      if (!title || seen.has(title.toLowerCase())) continue;
      seen.add(title.toLowerCase());
      items.push({
        time: kkTime(ev.openingHoursEs || ev.openingHoursEu),
        title,
        place: clean(ev.establishmentEs || ev.establishmentEu || '', 60),
        type: clean(ev.typeEs || '', 30),
      });
    }
    if (page >= Number(j.totalPages || 1)) break;
  }
  items.sort((a, b) => String(a.time || '99:99').localeCompare(String(b.time || '99:99')));
  const top = items.slice(0, 40);
  // Caché: solo hoy y mañana (lo viejo se poda para no crecer).
  const next = {};
  next[day] = { fetchedOn: today, items: top };
  for (const [k, v] of Object.entries(cache)) if (k >= today && k !== day) next[k] = v;
  try { fs.writeFileSync(KK_CACHE, JSON.stringify(next)); } catch {}
  log.info('suggest', `Kulturklik ${day}: ${top.length} evento(s) de Vitoria-Gasteiz cacheados`);
  return { ok: true, cached: false, date: day, items: top };
}

module.exports = { suggest, kulturklik, SEEDS };
