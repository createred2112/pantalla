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
    return { stages: {}, lastPublish: null, lastRealUpload: null };
  }
}

function write(state) {
  return require('./atomicWrite').writeJsonAtomic(STATUS_FILE, state);
}

// Marca el resultado de una etapa (generate | sequence | upload | import).
function set(stage, result) {
  const state = read();
  state.stages[stage] = {
    ts: new Date().toISOString(),
    ok: result.ok == null ? null : result.ok !== false,
    ...result,
  };
  if (stage === 'upload' && result.ok === true && !result.dryRun) {
    state.lastPublish = state.stages[stage].ts;
    state.lastRealUpload = state.stages[stage];
  }
  return write(state);
}

module.exports = { read, write, set, STATUS_FILE };
