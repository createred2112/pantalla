'use strict';
// Un proceso muerto no puede dejar la emisión bloqueada durante horas.
const assert = require('assert');
const { processIsAlive, shouldRemoveLock } = require('../src/util/pipelineLock');

assert.strictEqual(processIsAlive(process.pid), true, 'el proceso actual debe estar vivo');
assert.strictEqual(
  shouldRemoveLock({ pid: 123, ageMs: 1000 }, 7200000, () => false),
  true,
  'un candado reciente pero huérfano debe retirarse',
);
assert.strictEqual(
  shouldRemoveLock({ pid: 123, ageMs: 1000 }, 7200000, () => true),
  false,
  'un candado reciente de un proceso vivo debe respetarse',
);
assert.strictEqual(
  shouldRemoveLock({ pid: 123, ageMs: 7200000 }, 7200000, () => true),
  true,
  'un candado que agotó su límite debe retirarse',
);

console.log('OK: los candados huérfanos se liberan sin tocar procesos vivos');
