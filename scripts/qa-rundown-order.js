'use strict';

const assert = require('assert');
const { reorderSlots, isEmptyManualNewsSlot } = require('../src/rundown');

const slots = ['a', 'b', 'oculto', 'c', 'despues'].map((id) => ({ id }));
const reordered = reorderSlots(slots, ['c', 'a', 'b']).map((slot) => slot.id);
assert.deepStrictEqual(reordered, ['c', 'a', 'oculto', 'b', 'despues']);

const partial = reorderSlots(slots, ['b', 'a']).map((slot) => slot.id);
assert.deepStrictEqual(partial, ['b', 'a', 'oculto', 'c', 'despues']);

assert.strictEqual(isEmptyManualNewsSlot({
  id: 'noticia_1',
  label: 'Noticia propia',
  source: 'fixed',
  template: 'noticia',
  title: '',
  subtitle: 'GasteizBerri',
  body: '',
}), true);

assert.strictEqual(isEmptyManualNewsSlot({
  id: 'noticia_1',
  label: 'Noticia propia',
  source: 'fixed',
  template: 'noticia',
  title: 'Nueva apertura en el centro',
  subtitle: 'GasteizBerri',
  body: '',
}), false);

console.log('OK: el orden visible persiste y las noticias manuales vacias no entran');
