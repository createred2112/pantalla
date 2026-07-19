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
  assert.strictEqual(empty.readyCount, 7, 'Agenda vacía repite otra pieza disponible; Fotos sigue siendo un bloqueo real');
  assert.deepStrictEqual(empty.blockers.map((item) => item.code), ['photo-empty']);

  const agenda = [{ title: 'Agenda', body: '19:00 | Concierto', template: 'agenda', enabled: true }];
  const photo = [{ title: '', body: '', photo: 'data/uploads/foto.jpg', template: 'foto', enabled: true }];
  assert.strictEqual(plan({ agendaEventos: agenda }).readyCount, 7);
  assert.strictEqual(plan({ fotosGasteizberri: photo }).readyCount, 8);
  const complete = plan({ agendaEventos: agenda, fotosGasteizberri: photo });
  assert.strictEqual(complete.ok, true);
  assert.strictEqual(complete.readyCount, 8);

  const promoFallback = rundown.planMaterialization({
    date: '2026-07-18',
    rundown: {
      title: 'QA fallback de agenda', days: {},
      slots: [fixed('uno'), fixed('dos'), fixed('tres'), fixed('cuatro'), fixed('cinco'),
        { id: 'agenda', label: 'Agenda', enabled: true, source: 'library', libraryKey: 'agendaEventos' },
        { id: 'promo', label: 'Vídeo promo', enabled: true, source: 'file', type: 'video', file: 'assets/logo.png', title: 'Promo anterior' },
        { id: 'foto', label: 'Foto GasteizBerri', enabled: true, source: 'library', libraryKey: 'fotosGasteizberri' }],
    },
    library: { agendaEventos: [], fotosGasteizberri: photo },
  });
  assert.strictEqual(promoFallback.ok, true, 'una promo disponible debe cubrir la posición de Agenda vacía');
  assert.strictEqual(promoFallback.readyCount, 8);
  assert.deepStrictEqual(promoFallback.blockers, []);
  assert.match(promoFallback.report.find((row) => row.id === 'agenda').note, /se repite Vídeo promo/);

  const workerFallback = rundown.planMaterialization({
    date: '2026-07-18',
    rundown: {
      title: 'QA worker degradado', days: {},
      slots: [fixed('uno'), fixed('dos'), fixed('tres'), fixed('cuatro'), fixed('cinco'), fixed('seis'), fixed('siete'),
        { id: 'worker', label: 'Dato automático', enabled: true, source: 'worker', workerKey: 'qaMissingWorker', template: 'noticia' }],
    },
    library: {},
  });
  assert.strictEqual(workerFallback.ok, true);
  assert.deepStrictEqual(workerFallback.blockers, []);

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
  assert.strictEqual(generated, false, 'generate() no debe ejecutarse con 7/8');
  assert.match(result.steps.rundown.error, /Foto GasteizBerri/);
  console.log('✓ Preflight: Agenda vacía usa fallback y Fotos vacía bloquea antes de renderizar');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
