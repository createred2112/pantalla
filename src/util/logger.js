'use strict';
// Log en formato JSON-lines (logs/pantalla.log) + eco por consola.
const fs = require('fs');
const path = require('path');
const { paths } = require('../config');

const LOG_FILE = path.join(paths.logs, 'pantalla.log');

function write(level, stage, msg, extra) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    stage,
    msg,
    ...(extra ? { data: extra } : {}),
  };
  try {
    fs.mkdirSync(paths.logs, { recursive: true });
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
  } catch (e) {
    // Si falla el log en disco no debe tumbar el proceso.
  }
  const line = `[${entry.ts}] ${level.toUpperCase()} (${stage}) ${msg}`;
  if (level === 'error') console.error(line);
  else console.log(line);
  return entry;
}

// Devuelve las últimas N líneas del log parseadas.
function tail(n = 200) {
  try {
    const raw = fs.readFileSync(LOG_FILE, 'utf8').trim();
    if (!raw) return [];
    const lines = raw.split('\n').slice(-n);
    return lines.map((l) => {
      try { return JSON.parse(l); } catch { return { raw: l }; }
    });
  } catch {
    return [];
  }
}

module.exports = {
  info: (stage, msg, extra) => write('info', stage, msg, extra),
  warn: (stage, msg, extra) => write('warn', stage, msg, extra),
  error: (stage, msg, extra) => write('error', stage, msg, extra),
  tail,
  LOG_FILE,
};
