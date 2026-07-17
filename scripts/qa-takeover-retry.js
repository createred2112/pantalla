'use strict';
// QA del reintento del takeover (F3): si la emisión está ocupada
// (PIPELINE_BUSY), la publicación del takeover debe reintentar hasta que el
// candado se libere — y rendirse solo con errores que no son el candado.
const assert = require('assert');
const { withBusyRetry } = require('../src/takeover');

function busyError() {
  const e = new Error('La emision ya esta trabajando');
  e.code = 'PIPELINE_BUSY';
  return e;
}

(async () => {
  // 1) Ocupado dos veces y a la tercera va la vencida.
  let calls = 0;
  const r = await withBusyRetry(async () => {
    calls++;
    if (calls < 3) throw busyError();
    return { ok: true };
  }, { attempts: 5, waitMs: 10 });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(calls, 3, 'debió reintentar exactamente hasta liberarse');

  // 2) Si nunca se libera, acaba rindiéndose con el error del candado.
  let gaveUp = false;
  try {
    await withBusyRetry(async () => { throw busyError(); }, { attempts: 3, waitMs: 10 });
  } catch (e) {
    gaveUp = e.code === 'PIPELINE_BUSY';
  }
  assert(gaveUp, 'debió rendirse tras agotar los reintentos');

  // 3) Un error normal (no el candado) NO se reintenta.
  let normalCalls = 0;
  try {
    await withBusyRetry(async () => { normalCalls++; throw new Error('fallo real'); }, { attempts: 5, waitMs: 10 });
    assert.fail('debió propagar el fallo real');
  } catch (e) {
    assert.strictEqual(e.message, 'fallo real');
  }
  assert.strictEqual(normalCalls, 1, 'los errores reales no se reintentan');

  console.log('OK: el takeover reintenta con el candado ocupado y no enmascara errores reales');
})().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
