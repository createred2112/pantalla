'use strict';
// AVISOS: notificaciones push (Web Push / VAPID) + recordatorios proactivos.
// La pantalla te avisa a ti, no al revés: publicación fallida, verificación
// FTP con diferencias, agenda del día sin cargar a las 8:30...
//
// Requiere el paquete "web-push" (está en package.json). Si faltara, todo
// degrada con un aviso en el log: el resto del sistema no se ve afectado.
const fs = require('fs');
const path = require('path');
const { paths } = require('../config');
const log = require('./logger');

const DATA_DIR = path.dirname(paths.data);
const KEYS_FILE = path.join(DATA_DIR, 'push-keys.json');
const SUBS_FILE = path.join(DATA_DIR, 'push-subs.json');

let _webpush = null;
function lib() {
  if (_webpush !== null) return _webpush;
  try { _webpush = require('web-push'); }
  catch { _webpush = false; log.warn('push', 'Falta el paquete web-push (npm install): los avisos push quedan desactivados'); }
  return _webpush;
}

function keys() {
  try { const k = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8')); if (k && k.publicKey) return k; } catch {}
  const wp = lib();
  if (!wp) return null;
  const k = wp.generateVAPIDKeys();
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(KEYS_FILE, JSON.stringify(k)); } catch {}
  return k;
}

function subs() {
  try { const s = JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8')); return Array.isArray(s) ? s : []; } catch { return []; }
}
function saveSubs(list) {
  try { fs.writeFileSync(SUBS_FILE, JSON.stringify(list)); } catch {}
}

function publicKey() {
  const k = keys();
  return (k && k.publicKey) || null;
}
function subscribe(sub) {
  if (!sub || !sub.endpoint) return { ok: false, error: 'Suscripción no válida' };
  const list = subs().filter((s) => s.endpoint !== sub.endpoint);
  list.push(sub);
  saveSubs(list);
  log.info('push', `Dispositivo suscrito a avisos (${list.length} en total)`);
  return { ok: true, count: list.length };
}
function unsubscribe(endpoint) {
  saveSubs(subs().filter((s) => s.endpoint !== endpoint));
}
function count() { return subs().length; }

async function notify(title, body, tag = 'pantalla') {
  const wp = lib();
  const k = keys();
  const list = subs();
  if (!wp || !k || !list.length) return { sent: 0 };
  wp.setVapidDetails('mailto:pantalla@gasteizberri.com', k.publicKey, k.privateKey);
  let sent = 0;
  for (const sub of [...list]) {
    try {
      await wp.sendNotification(sub, JSON.stringify({ title, body, tag }), { TTL: 3600 });
      sent++;
    } catch (e) {
      // Suscripción muerta (app desinstalada, permiso retirado): se limpia sola.
      if (e && (e.statusCode === 404 || e.statusCode === 410)) unsubscribe(sub.endpoint);
    }
  }
  if (sent) log.info('push', `Aviso enviado a ${sent} dispositivo(s): ${title}`);
  return { sent };
}

// --- Recordatorio proactivo: agenda del día sin cargar (8:30) ---
let _reminderDay = '';
function tick() {
  try {
    const now = new Date();
    const day = now.toLocaleDateString('sv-SE');
    if (now.getHours() === 8 && now.getMinutes() >= 30 && _reminderDay !== day) {
      _reminderDay = day;
      const q = require('../rundown').quickAgenda(day);
      if (!q.count) {
        notify('Agenda de hoy sin cargar', 'Aún no hay eventos del día en pantalla. Ábrela desde el panel: un minuto.', 'agenda-reminder');
      }
    }
  } catch {}
}
function start() {
  const t = setInterval(tick, 5 * 60000);
  if (t.unref) t.unref();
}

module.exports = { notify, publicKey, subscribe, unsubscribe, count, start };
