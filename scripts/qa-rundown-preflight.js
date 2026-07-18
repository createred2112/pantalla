'use strict';
const assert = require('assert');
const rundown = require('../src/rundown');
const { publish } = require('../src/pipeline/publish');

function fixed(id) {
  return { id, label: id, enabled: true, source: 'fixed', template: 'noticia', title: `Lista ${id}` };
}

function plan(library) {
  return rundown.planMaterialization({
    date: '2026-07-18',
    rundown: {
      title: 'QA preflight', days: {},
      slots: [fixed('uno'), fixed('dos'), fixed('tres'), fixed('cuatro'), fixed('cinco'), fixed('seis'),
        { id: 'agenda', label: 'Agenda', enabled: true, source: 'library', libraryKey: 'agendaEventos' },
        { id: 'foto', label: 'Foto GasteizBerri', enabled: true, source: 'library', libraryKey: 'fotosGasteizberri' }],
    },
    library: { agendaEventos: [], fotosGasteizberri: [], ...library },
  });
}

async function main() {
  const empty = plan({});
  assert.strictEqual(empty.ok, false);
  assert.strictEqual(empty.structuralCount, 8);
  assert.strictEqual(empty.readyCount, 6);
  assert.deepStrictEqual(empty.blockers.map((item) => item.code), ['agenda-empty', 'photo-empty']);

  const agenda = [{ title: 'Agenda', body: '19:00 | Concierto', template: 'agenda', enabled: true }];
  const photo = [{ title: '', body: '', photo: 'data/uploads/foto.jpg', template: 'foto', enabled: true }];
  assert.strictEqual(plan({ agendaEventos: agenda }).readyCount, 7);
  assert.strictEqual(plan({ fotosGasteizberri: photo }).readyCount, 7);
  const complete = plan({ agendaEventos: agenda, fotosGasteizberri: photo });
  assert.strictEqual(complete.ok, true);
  assert.strictEqual(complete.readyCount, 8);

  let generated = false;
  const result = await publish({
    lock: false,
    skipImport: true,
    dryRun: true,
    uploadSource: 'qa-preflight',
    _deps: {
      refreshAll: async () => ({ results: [] }),
      materialize: () => ({ ...empty, count: empty.readyCount }),
      generate: async () => { generated = true; return { ok: true, count: 8 }; },
    },
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(generated, false, 'generate() no debe ejecutarse con 6/8');
  assert.match(result.steps.rundown.error, /Agenda/);
  assert.match(result.steps.rundown.error, /Foto GasteizBerri/);
  console.log('✓ Preflight 6/8: bloquea antes de renderizar y nombra Agenda/Fotos');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
