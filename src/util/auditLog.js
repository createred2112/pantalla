'use strict';
// Registro operativo legible: una linea JSON por evento importante del flujo.
// Complementa al log tecnico con una historia clara de cada preparacion/subida.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { paths } = require('../config');

const AUDIT_FILE = path.join(paths.logs, 'operaciones.log');

function runId(prefix = 'run') {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `${prefix}-${stamp}-${crypto.randomBytes(3).toString('hex')}`;
}

function compact(value) {
  if (value == null) return value;
  try {
    const raw = JSON.stringify(value);
    if (raw.length <= 6000) return value;
    return {
      runId: value.runId,
      ok: value.ok,
      source: value.source,
      count: value.count,
      truncated: true,
      text: raw.slice(0, 6000),
    };
  } catch {
    return { unserializable: true };
  }
}

function event(type, message, data = {}) {
  const entry = {
    ts: new Date().toISOString(),
    type,
    message,
    ...compact(data),
  };
  try {
    fs.mkdirSync(paths.logs, { recursive: true });
    fs.appendFileSync(AUDIT_FILE, JSON.stringify(entry) + '\n');
  } catch {
    // El registro no debe parar la emision.
  }
  return entry;
}

function tail(n = 200) {
  try {
    const raw = fs.readFileSync(AUDIT_FILE, 'utf8').trim();
    if (!raw) return [];
    return raw.split('\n').slice(-n).map((line) => {
      try { return JSON.parse(line); } catch { return { raw: line }; }
    });
  } catch {
    return [];
  }
}

module.exports = { event, tail, runId, AUDIT_FILE };
