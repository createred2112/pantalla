'use strict';

const assert = require('assert');
const path = require('path');

const ROOT = path.join(__dirname, '..');
function mock(relative, exports) {
  const id = require.resolve(path.join(ROOT, relative));
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

const now = new Date();
const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const currentHourKey = `${day}T${String(now.getHours()).padStart(2, '0')}`;
const stages = {
  autopilot: { ok: true, day, ts: new Date().toISOString() },
  'autopilot-hora': { ok: true, hourKey: `${day}T00`, ts: new Date(0).toISOString() },
  'autopilot-sync': { ok: true, day, signature: 'igual', ts: new Date().toISOString() },
};

mock('src/config.js', {
  cfg: {
    autopilot: { enabled: true, time: '00:00', mode: 'publish', publish: true, liveSync: true, syncEveryMinutes: 60, retryMinutes: 5, maxAttempts: 3 },
    naming: { fixedFiles: Array.from({ length: 8 }, (_, i) => `berri-${i + 1}.mp4`) },
    screenProfile: { requiredCount: 8 },
  },
  saveConfig() {},
  ftpConfig: () => ({ host: 'qa', user: 'qa' }),
  abs: (value) => value,
});
mock('src/util/logger.js', { info() {}, warn() {}, error() {} });
mock('src/util/status.js', {
  read: () => ({ stages }),
  set(key, value) { stages[key] = { ...value, ts: new Date().toISOString() }; return stages[key]; },
});
mock('src/util/auditLog.js', { runId: () => 'qa-hourly', event() {} });
mock('src/util/pipelineLock.js', { withLock: async (_owner, fn) => fn() });
mock('src/store.js', {
  active: () => Array.from({ length: 8 }, (_, i) => ({ id: `card-${i}`, type: 'generated', template: 'noticia', title: `Card ${i}` })),
});
mock('src/util/renderMeta.js', { renderHash: (card) => `hash-${card.id}` });
mock('src/workers.js', { refreshAll: async () => ({ results: {} }) });

let materializeOk = true;
mock('src/rundown.js', {
  read: () => ({ rundown: { slots: [{ id: 'tiempo', enabled: true, source: 'worker', workerKey: 'weather', rotation: 'hora' }] } }),
  materialize: () => materializeOk
    ? { ok: true, count: 8, readyCount: 8, requiredCount: 8 }
    : { ok: false, count: 7, readyCount: 7, requiredCount: 8, error: 'Agenda sin reemplazo', blockers: [{ code: 'agenda-empty' }] },
});

let uploads = 0;
mock('src/pipeline/publish.js', {
  publish: async (options) => {
    assert.strictEqual(options.uploadSource, 'automatic-hourly');
    uploads++;
    return { ok: true };
  },
});

async function main() {
  const autopilot = require('../src/autopilot');

  await autopilot.tick();
  assert.strictEqual(uploads, 1, 'una hora nueva debe hacer una subida real aunque la firma anterior coincida');
  assert.strictEqual(stages['autopilot-hora'].hourKey, currentHourKey);
  assert.strictEqual(stages['autopilot-hora'].ok, true);

  await autopilot.tick();
  assert.strictEqual(uploads, 1, 'la misma hora correcta no se publica dos veces');

  stages['autopilot-hora'] = { ok: false, hourKey: currentHourKey, ts: new Date().toISOString() };
  materializeOk = false;
  await autopilot.tick();
  assert.strictEqual(uploads, 1, 'una tanda incompleta se detiene antes del FTP');
  assert.strictEqual(stages['autopilot-hora'].ok, false);

  materializeOk = true;
  await autopilot.tick();
  assert.strictEqual(uploads, 2, 'una hora fallida se reintenta en cuanto vuelve a estar completa');
  assert.strictEqual(stages['autopilot-hora'].ok, true);

  console.log('OK: el piloto sube una vez por hora, no oculta tandas incompletas y reintenta fallos');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
