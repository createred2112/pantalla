'use strict';
// Autenticación de administradores: contraseñas con scrypt + cookie de sesión
// firmada con HMAC. Sin dependencias externas (solo crypto de Node).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ROOT, env } = require('./config');
const log = require('./util/logger');

const ADMINS_FILE = path.join(ROOT, 'config', 'admins.json');
const SECRET_FILE = path.join(ROOT, 'data', '.session-secret');
const COOKIE = 'pantalla_session';
const TTL_DAYS = 7;

// --- Secreto de firma (persistente entre reinicios) ---
function secret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  try {
    return fs.readFileSync(SECRET_FILE, 'utf8').trim();
  } catch {
    const s = crypto.randomBytes(32).toString('hex');
    fs.mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
    fs.writeFileSync(SECRET_FILE, s, { mode: 0o600 });
    return s;
  }
}

// --- Almacén de administradores ---
function loadAdmins() {
  try {
    const d = JSON.parse(fs.readFileSync(ADMINS_FILE, 'utf8'));
    return Array.isArray(d.admins) ? d.admins : [];
  } catch {
    return [];
  }
}
function saveAdmins(admins) {
  fs.mkdirSync(path.dirname(ADMINS_FILE), { recursive: true });
  fs.writeFileSync(ADMINS_FILE, JSON.stringify({ admins }, null, 2), { mode: 0o600 });
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}
function safeEqual(a, b) {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function addAdmin(user, password) {
  user = String(user || '').trim().toLowerCase();
  if (!user || !password) throw new Error('usuario y contraseña obligatorios');
  if (password.length < 6) throw new Error('la contraseña debe tener al menos 6 caracteres');
  const admins = loadAdmins();
  if (admins.some((a) => a.user === user)) throw new Error('ese usuario ya existe');
  const { salt, hash } = hashPassword(password);
  admins.push({ user, salt, hash, createdAt: new Date().toISOString() });
  saveAdmins(admins);
  log.info('auth', `Administrador creado: ${user}`);
  return user;
}
function removeAdmin(user) {
  user = String(user || '').trim().toLowerCase();
  const admins = loadAdmins();
  const next = admins.filter((a) => a.user !== user);
  if (next.length === admins.length) return false;
  saveAdmins(next);
  log.info('auth', `Administrador eliminado: ${user}`);
  return true;
}
function listAdmins() {
  return loadAdmins().map((a) => ({ user: a.user, createdAt: a.createdAt }));
}
function verifyCredentials(user, password) {
  user = String(user || '').trim().toLowerCase();
  const a = loadAdmins().find((x) => x.user === user);
  if (!a) return false;
  const { hash } = hashPassword(password, a.salt);
  return safeEqual(hash, a.hash) ? user : false;
}

// --- Token de sesión firmado ---
function createToken(user) {
  const payload = Buffer.from(JSON.stringify({
    u: user, exp: Date.now() + TTL_DAYS * 86400000,
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  if (!safeEqual(sig, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.exp < Date.now()) return null;
    return data.u;
  } catch { return null; }
}

// --- Cookies ---
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((c) => {
    const i = c.indexOf('=');
    if (i > -1) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
  });
  return out;
}
function setSessionCookie(req, res, token) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const parts = [
    `${COOKIE}=${token}`, 'HttpOnly', 'SameSite=Lax', 'Path=/',
    `Max-Age=${TTL_DAYS * 86400}`,
  ];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Path=/; Max-Age=0`);
}

// --- Limitador simple de intentos por IP ---
const attempts = new Map();
function throttle(ip) {
  const now = Date.now();
  const rec = attempts.get(ip) || { count: 0, until: 0 };
  if (rec.until > now) return false; // bloqueado
  return true;
}
function noteFailure(ip) {
  const now = Date.now();
  const rec = attempts.get(ip) || { count: 0, until: 0 };
  rec.count++;
  if (rec.count >= 5) { rec.until = now + 5 * 60000; rec.count = 0; } // 5 min de bloqueo
  attempts.set(ip, rec);
}
function noteSuccess(ip) { attempts.delete(ip); }

// Usuario autenticado de una petición (cookie de sesión o token de máquina).
function userOf(req) {
  // Token de máquina (para automatizaciones: cron, worker, etc.)
  if (env.panelToken) {
    const t = req.headers['x-panel-token'] || req.query.token;
    if (t && safeEqual(String(t), env.panelToken)) return { user: 'token', machine: true };
  }
  const cookies = parseCookies(req);
  const u = verifyToken(cookies[COOKIE]);
  return u ? { user: u } : null;
}

module.exports = {
  COOKIE, addAdmin, removeAdmin, listAdmins, verifyCredentials,
  createToken, verifyToken, parseCookies, setSessionCookie, clearSessionCookie,
  throttle, noteFailure, noteSuccess, userOf, hasAdmins: () => loadAdmins().length > 0,
};
