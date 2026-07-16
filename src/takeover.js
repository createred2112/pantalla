'use strict';
// TAKEOVER URGENTE: una alerta ocupa la emisión entera (o intercalada) durante
// X minutos y después la pantalla VUELVE SOLA a la programación normal.
// No toca la escaleta ni las cartelas: es una capa sobre la emisión que se
// aplica en store.active(), así que quitarla es instantáneo y sin residuos.
const fs = require('fs');
const path = require('path');
const { cfg, paths } = require('./config');
const log = require('./util/logger');

const FILE = path.join(path.dirname(paths.data), 'takeover.json');

function read() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return null; }
}

function state() {
  const s = read();
  const active = Boolean(s && s.until && Date.now() < s.until && s.cardId);
  return {
    active,
    until: s && s.until ? new Date(s.until).toISOString() : null,
    minutesLeft: active ? Math.max(1, Math.round((s.until - Date.now()) / 60000)) : 0,
    cardId: (s && s.cardId) || null,
    mode: (s && s.mode) === 'mix' ? 'mix' : 'full',
    title: (s && s.title) || '',
  };
}

function requiredCount() {
  const fixed = cfg.naming && Array.isArray(cfg.naming.fixedFiles) ? cfg.naming.fixedFiles.filter(Boolean) : [];
  return fixed.length || Number(cfg.screenProfile && cfg.screenProfile.requiredCount) || 8;
}

// Capa sobre la emisión normal (llamada por store.active()).
function apply(baseCards) {
  const s = state();
  if (!s.active) return baseCards;
  const store = require('./store');
  const card = store.list().find((c) => c.id === s.cardId);
  if (!card) return baseCards;
  const n = requiredCount();
  const alert = (order) => ({ ...card, enabled: true, order });
  if (s.mode === 'full') {
    return Array.from({ length: n }, (_, i) => alert(i + 1));
  }
  // mix: alerta en posiciones impares, programación normal entre medias.
  const others = baseCards.filter((c) => c.id !== card.id);
  const out = [];
  let oi = 0;
  for (let i = 0; i < n; i++) {
    if (i % 2 === 0 || !others.length) out.push(alert(i + 1));
    else out.push({ ...others[oi++ % others.length], order: i + 1 });
  }
  return out;
}

async function publishNow(reason) {
  try {
    const r = await require('./pipeline/publish').publish({ uploadSource: 'automatic-takeover' });
    log.info('takeover', `${reason}: publicación ${r && r.ok ? 'OK' : 'con fallo'}`);
    return r;
  } catch (e) {
    log.error('takeover', `${reason}: ${e.message}`);
    return { ok: false, error: e.message };
  }
}

// Activa el takeover: crea la cartela de alerta (apagada: solo existe para la
// capa), guarda la ventana y publica YA.
function activate({ title, body, theme, minutes, mode } = {}) {
  const store = require('./store');
  const clean = String(title || '').trim();
  if (!clean) return { ok: false, error: 'Falta el titular de la alerta' };
  const mins = Math.min(24 * 60, Math.max(5, Number(minutes) || 60));
  const card = store.add({
    enabled: false, // fuera de la emisión normal: la inyecta la capa takeover
    type: 'generated',
    template: 'alerta',
    theme: String(theme || 'rojo'),
    title: clean,
    subtitle: 'ÚLTIMA HORA',
    body: String(body || ''),
    date: 'AHORA',
    duration: 10,
    video: true,
    source: 'manual',
  });
  const s = { cardId: card.id, title: clean, mode: mode === 'mix' ? 'mix' : 'full', startedAt: Date.now(), until: Date.now() + mins * 60000 };
  fs.writeFileSync(FILE, JSON.stringify(s));
  log.warn('takeover', `TAKEOVER activado ${s.mode === 'full' ? 'a pantalla completa' : 'intercalado'} durante ${mins} min: ${clean}`);
  try { require('./util/notify').notify('🚨 Takeover activado', `«${clean}» ocupa la pantalla ${mins} min. Volverá sola a la programación.`, 'takeover'); } catch {}
  publishNow('Subiendo takeover'); // asíncrono a propósito
  return { ok: true, ...state(), card };
}

// Desactiva (manual o por expiración) y restaura la programación normal.
function deactivate(reason = 'manual') {
  const s = read();
  try { fs.rmSync(FILE, { force: true }); } catch {}
  if (s && s.cardId) {
    try { require('./store').remove(s.cardId); } catch {}
  }
  log.info('takeover', `Takeover desactivado (${reason}); restaurando programación normal`);
  try { require('./util/notify').notify('Takeover terminado', 'La pantalla vuelve a la programación normal.', 'takeover'); } catch {}
  publishNow('Restaurando programación normal');
  return { ok: true, ...state() };
}

// Vigilante: al expirar la ventana, restaura solo (aunque la publicación
// automática esté apagada: el takeover lleva la vuelta incluida).
function tick() {
  const s = read();
  if (s && s.until && Date.now() >= s.until) deactivate('expiración');
}
function start() {
  const t = setInterval(tick, 60000);
  if (t.unref) t.unref();
}

module.exports = { state, apply, activate, deactivate, start };
