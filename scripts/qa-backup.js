'use strict';
// QA del BACKUP (F2): el ciclo completo backup → desastre → restauración,
// contra un proyecto de mentira en un directorio temporal. No toca los datos
// reales. Si esto está en verde, la restauración documentada FUNCIONA.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const backup = require('../src/util/backup');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pantalla-qa-backup-'));
try {
  // Un proyecto en miniatura con datos "valiosos".
  fs.mkdirSync(path.join(root, 'data', 'uploads'), { recursive: true });
  fs.mkdirSync(path.join(root, 'data', 'emisiones'), { recursive: true });
  fs.mkdirSync(path.join(root, 'config'), { recursive: true });
  fs.writeFileSync(path.join(root, 'data', 'cards.json'), JSON.stringify({ cards: [{ id: 'c1', title: 'VALIOSO' }] }));
  fs.writeFileSync(path.join(root, 'data', 'uploads', 'foto.jpg'), 'FOTO-BINARIA');
  fs.writeFileSync(path.join(root, 'data', 'emisiones', 'pesado.mp4'), 'NO-DEBE-ENTRAR');
  fs.writeFileSync(path.join(root, 'config', 'pantalla.config.json'), JSON.stringify({ palette: { azul: {} } }));

  // 1) Backup.
  const b = backup.run({ root });
  assert(fs.existsSync(b.file), 'el backup no se creó');

  // Las emisiones (histórico con su propia retención) quedan fuera.
  const { execSync } = require('child_process');
  const listado = execSync(`tar -tzf "${b.file}"`, { encoding: 'utf8' });
  assert(listado.includes('data/cards.json'), 'faltan los JSON en el backup');
  assert(listado.includes('data/uploads/foto.jpg'), 'faltan las fotos en el backup');
  assert(!listado.includes('pesado.mp4'), 'las emisiones no deberían entrar en el backup');

  // 2) Desastre: se corrompen los datos y desaparece una foto.
  fs.writeFileSync(path.join(root, 'data', 'cards.json'), '{corrupto');
  fs.rmSync(path.join(root, 'data', 'uploads', 'foto.jpg'));

  // 3) Restauración.
  const r = backup.restore(b.file, { root });
  assert(fs.existsSync(r.safety), 'no se guardó el estado previo a la restauración');
  const cards = JSON.parse(fs.readFileSync(path.join(root, 'data', 'cards.json'), 'utf8'));
  assert.strictEqual(cards.cards[0].title, 'VALIOSO', 'los datos no volvieron');
  assert.strictEqual(fs.readFileSync(path.join(root, 'data', 'uploads', 'foto.jpg'), 'utf8'), 'FOTO-BINARIA', 'la foto no volvió');

  // 4) Retención: un backup con fecha de hace 20 días debe retirarse.
  const viejo = path.join(path.dirname(b.file), 'pantalla-datos-2020-01-01.tgz');
  fs.copyFileSync(b.file, viejo);
  const old = new Date(Date.now() - 20 * 24 * 3600000);
  fs.utimesSync(viejo, old, old);
  backup.run({ root });
  assert(!fs.existsSync(viejo), 'la retención de 14 días no retiró el backup viejo');

  console.log('OK: backup → desastre → restauración y retención de 14 días funcionan');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
