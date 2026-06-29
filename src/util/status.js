'use strict';
// Estado persistente de cada etapa del pipeline (logs/status.json).
const fs = require('fs');
const path = require('path');
const { paths } = require('../config');

const STATUS_FILE = path.join(paths.logs, 'status.json');

function read() {
  try {
    return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
  } catch {
    return { stages: {}, lastPublish: null };
  }
}

function write(state) {
  fs.mkdirSync(paths.logs, { recursive: true });
  fs.writeFileSync(STATUS_FILE, JSON.stringify(state, null, 2));
  return state;
}

// Marca el resultado de una etapa (generate | sequence | upload | import).
function set(stage, result) {
  const state = read();
  state.stages[stage] = {
    ts: new Date().toISOString(),
    ok: result.ok !== false,
    ...result,
  };
  if (stage === 'upload' && result.ok !== false && !result.dryRun) {
    state.lastPublish = state.stages[stage].ts;
  }
  return write(state);
}

module.exports = { read, write, set, STATUS_FILE };
