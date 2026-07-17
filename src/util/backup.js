'use strict';
// BACKUP DIARIO (F2): copia de data/ + config/ en backups/, desde el propio
// servidor (sin cron que configurar). Retención: 14 días.
//
// Qué entra: todos los JSON vivos (cartelas, escaleta, bancos, plantillas ★,
// layouts, config, admins) y las fotos/vídeos subidos (data/uploads).
// Qué NO entra: data/emisiones (ya es un archivo histórico con su propia
// retención), worker-inbox (material transitorio del worker) y cachés.
//
// Restaurar: npm run backup:restore -- backups/<archivo>.tgz
// (antes de pisar nada se guarda el estado actual en pre-restauracion-*.tgz)
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const log = require('./logger');

const DEFAULT_ROOT = path.resolve(__dirname, '..', '..');
const KEEP_DAYS = Number(process.env.PANTALLA_BACKUP_KEEP_DAYS || 14);
const EXCLUDES = ['data/emisiones', 'data/worker-inbox', 'data/efemerides-cache.json', 'data/kulturklik-cache.json'];

function backupsDir(root) { return path.join(root || DEFAULT_ROOT, 'backups'); }

function dayStamp(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function tar(args, cwd) {
  const r = spawnSync('tar', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error('tar: ' + ((r.stderr || '').trim() || 'código ' + r.status));
}

// Crea (o rehace) el backup de HOY y borra los de hace más de KEEP_DAYS días.
function run(options = {}) {
  const root = options.root || DEFAULT_ROOT;
  const dir = backupsDir(root);
  fs.mkdirSync(dir, { recursive: true });
  const name = `pantalla-datos-${dayStamp()}.tgz`;
  const tmp = path.join(dir, '.' + name + '.tmp');
  const out = path.join(dir, name);
  const args = ['-czf', tmp];
  for (const ex of EXCLUDES) args.push('--exclude', ex);
  for (const item of ['data', 'config']) {
    if (fs.existsSync(path.join(root, item))) args.push(item);
  }
  tar(args, root);
  fs.renameSync(tmp, out);
  const pruned = prune(dir);
  const size = fs.statSync(out).size;
  return { ok: true, file: out, sizeMb: Math.round(size / 1048576 * 10) / 10, pruned };
}

function prune(dir) {
  const limit = Date.now() - KEEP_DAYS * 24 * 3600000;
  let removed = 0;
  for (const f of fs.readdirSync(dir)) {
    if (!/^pantalla-datos-\d{4}-\d{2}-\d{2}\.tgz$/.test(f)) continue;
    try {
      if (fs.statSync(path.join(dir, f)).mtimeMs < limit) {
        fs.rmSync(path.join(dir, f), { force: true });
        removed++;
      }
    } catch {}
  }
  return removed;
}

function list(root) {
  const dir = backupsDir(root);
  try {
    return fs.readdirSync(dir)
      .filter((f) => /^pantalla-datos-.*\.tgz$/.test(f))
      .sort()
      .map((f) => ({ file: path.join(dir, f), sizeMb: Math.round(fs.statSync(path.join(dir, f)).size / 1048576 * 10) / 10 }));
  } catch { return []; }
}

// Restaura un backup sobre data/ y config/. El estado actual se guarda antes
// en backups/pre-restauracion-<momento>.tgz: restaurar nunca destruye nada.
function restore(file, options = {}) {
  const root = options.root || DEFAULT_ROOT;
  const full = path.resolve(root, file);
  if (!fs.existsSync(full)) throw new Error('No existe el archivo ' + full);
  const dir = backupsDir(root);
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const safety = path.join(dir, `pre-restauracion-${stamp}.tgz`);
  const safetyArgs = ['-czf', safety];
  for (const ex of EXCLUDES) safetyArgs.push('--exclude', ex);
  for (const item of ['data', 'config']) {
    if (fs.existsSync(path.join(root, item))) safetyArgs.push(item);
  }
  tar(safetyArgs, root);
  tar(['-xzf', full], root); // pisa data/ y config/ con lo del backup
  return { ok: true, restored: full, safety };
}

// Vigilante diario: a partir de las 04:30, si aún no hay backup de hoy, se
// hace. También al arrancar (por si el servidor estuvo apagado a esa hora).
let _timer = null;
function due(root) {
  const now = new Date();
  const beforeWindow = now.getHours() * 60 + now.getMinutes() < 4 * 60 + 30;
  if (beforeWindow) return false;
  return !fs.existsSync(path.join(backupsDir(root), `pantalla-datos-${dayStamp()}.tgz`));
}

function tick() {
  try {
    if (!due()) return;
    const r = run();
    log.info('backup', `Backup diario: ${path.basename(r.file)} (${r.sizeMb} MB)${r.pruned ? `, ${r.pruned} antiguo(s) retirado(s)` : ''}`);
  } catch (e) {
    log.error('backup', 'FALLO el backup diario: ' + e.message);
  }
}

function start() {
  if (process.env.PANTALLA_QA === '1') return; // el humo e2e no dispara backups
  if (_timer) return;
  _timer = setInterval(tick, 30 * 60000);
  _timer.unref();
  setTimeout(tick, 20000).unref(); // al arrancar, con el servidor ya asentado
}

module.exports = { run, restore, list, start, backupsDir, KEEP_DAYS };
