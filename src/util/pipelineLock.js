'use strict';
// Bloqueo exclusivo para el tramo delicado de emision:
// generar/reutilizar MP4, preparar publish/ y subir FTP.
const fs = require('fs');
const path = require('path');
const { paths } = require('../config');

const LOCK_DIR = path.join(paths.logs, 'emission.lock');
const INFO_FILE = path.join(LOCK_DIR, 'owner.json');
const DEFAULT_STALE_MS = 2 * 60 * 60 * 1000;

class PipelineBusyError extends Error {
  constructor(info) {
    const owner = info && info.owner ? info.owner : 'otra operacion';
    super(`La emision ya esta trabajando: ${owner}`);
    this.name = 'PipelineBusyError';
    this.code = 'PIPELINE_BUSY';
    this.status = 409;
    this.info = info || null;
  }
}

function readInfo() {
  try {
    return JSON.parse(fs.readFileSync(INFO_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function current() {
  const info = readInfo();
  if (!info || !info.startedAt) return null;
  const ageMs = Date.now() - Date.parse(info.startedAt);
  return { ...info, ageMs: Number.isFinite(ageMs) ? ageMs : null };
}

function processIsAlive(pid) {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 0) return false;
  try {
    process.kill(n, 0);
    return true;
  } catch (e) {
    // Sin permiso para consultar significa que el proceso sí existe.
    return Boolean(e && e.code === 'EPERM');
  }
}

function shouldRemoveLock(info, staleMs, isAlive = processIsAlive) {
  if (!info) return false;
  const expired = Number.isFinite(Number(info.ageMs)) && Number(info.ageMs) >= staleMs;
  const orphaned = Number.isInteger(Number(info.pid)) && !isAlive(Number(info.pid));
  return expired || orphaned;
}

function removeAbandonedLock(staleMs) {
  const info = current();
  if (!shouldRemoveLock(info, staleMs)) return false;
  try {
    fs.rmSync(LOCK_DIR, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

function acquire(owner, opts = {}) {
  const staleMs = Number(opts.staleMs || DEFAULT_STALE_MS);
  fs.mkdirSync(paths.logs, { recursive: true });
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const info = {
    owner: String(owner || 'emision'),
    pid: process.pid,
    token,
    startedAt: new Date().toISOString(),
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.mkdirSync(LOCK_DIR);
      fs.writeFileSync(INFO_FILE, JSON.stringify(info, null, 2));
      return {
        info,
        release() {
          const saved = readInfo();
          if (saved && saved.token && saved.token !== token) return;
          try { fs.rmSync(LOCK_DIR, { recursive: true, force: true }); } catch {}
        },
      };
    } catch (e) {
      if (e && e.code === 'EEXIST' && attempt === 0 && removeAbandonedLock(staleMs)) continue;
      if (e && e.code === 'EEXIST') throw new PipelineBusyError(current());
      throw e;
    }
  }
  throw new PipelineBusyError(current());
}

async function withLock(owner, fn, opts = {}) {
  const lock = acquire(owner, opts);
  try {
    return await fn(lock.info);
  } finally {
    lock.release();
  }
}

module.exports = {
  acquire, withLock, current, processIsAlive, shouldRemoveLock,
  cleanup: () => removeAbandonedLock(DEFAULT_STALE_MS),
  PipelineBusyError, LOCK_DIR,
};
