'use strict';

const assert = require('assert');
const { reorderSlots } = require('../src/rundown');

const slots = ['a', 'b', 'oculto', 'c', 'despues'].map((id) => ({ id }));
const reordered = reorderSlots(slots, ['c', 'a', 'b']).map((slot) => slot.id);
assert.deepStrictEqual(reordered, ['c', 'a', 'oculto', 'b', 'despues']);

const partial = reorderSlots(slots, ['b', 'a']).map((slot) => slot.id);
assert.deepStrictEqual(partial, ['b', 'a', 'oculto', 'c', 'despues']);

console.log('OK: el orden visible persiste sin mover los bloques no representados');
