'use strict';

const assert = require('assert');
const { reorderSlots, isEmptyManualNewsSlot, composeLineupCards, toCard } = require('../src/rundown');

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

const composed = composeLineupCards(
  [{ id: 'rd_a', source: 'rundown', enabled: true, order: 1 }],
  [
    { id: 'old_rd', source: 'rundown', enabled: true, order: 1 },
    { id: 'manual_a', source: 'manual', enabled: true, order: 2 },
    { id: 'manual_b', source: 'manual', enabled: false, order: 3 },
  ],
);
assert.deepStrictEqual(composed.cards.map((card) => card.id), ['rd_a', 'manual_a', 'manual_b']);
assert.strictEqual(composed.cards[1].enabled, false);
assert.strictEqual(composed.cards[2].enabled, false);
assert.strictEqual(composed.archived, 1);

const cleanPhoto = toCard(
  { id: 'foto', label: 'Foto GasteizBerri', source: 'library', libraryKey: 'fotosGasteizberri', template: 'foto' },
  { days: {}, fotosGasteizberri: [{ title: '', subtitle: '', body: '', photo: 'data/uploads/foto.jpg', template: 'foto', enabled: true }] },
  1,
  '2026-07-18',
  { foto: 0 },
);
assert.strictEqual(cleanPhoto.title, '');
assert.strictEqual(cleanPhoto.subtitle, '');
assert.strictEqual(cleanPhoto.body, '');

console.log('OK: orden, archivo de extras y fotos limpias sin textos de relleno');
