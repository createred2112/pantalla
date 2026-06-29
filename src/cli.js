'use strict';
// CLI: node src/cli.js <comando> [--dry-run]
//   generate | sequence | upload | import | publish | demo
const { ensureDirs } = require('./config');
const { generate } = require('./pipeline/generate');
const { sequence } = require('./pipeline/sequence');
const { upload } = require('./pipeline/upload');
const { importWorker } = require('./pipeline/importWorker');
const { publish } = require('./pipeline/publish');
const store = require('./store');
const auth = require('./auth');

async function main() {
  ensureDirs();
  const cmd = process.argv[2];
  const args = process.argv.slice(3).filter((a) => !a.startsWith('--'));
  const dryRun = process.argv.includes('--dry-run');

  switch (cmd) {
    case 'admin:add': {
      const [user, password] = args;
      if (!user || !password) {
        console.log('Uso: npm run admin:add -- <usuario> <contraseña>');
        process.exit(1);
      }
      auth.addAdmin(user, password);
      console.log(`Administrador "${user}" creado.`);
      return { ok: true };
    }
    case 'admin:remove': {
      const ok = auth.removeAdmin(args[0]);
      console.log(ok ? `Eliminado "${args[0]}".` : `No existe "${args[0]}".`);
      return { ok };
    }
    case 'admin:list': {
      const list = auth.listAdmins();
      console.log(list.length ? list.map((a) => `· ${a.user}  (${a.createdAt})`).join('\n') : 'Sin administradores.');
      return { ok: true };
    }
    case 'generate': return generate();
    case 'sequence': return sequence({ dryRun });
    case 'upload': return upload({ dryRun });
    case 'import': return importWorker();
    case 'publish': return publish({ dryRun });
    case 'demo': {
      // Crea una cartela por plantilla si no hay ninguna.
      if (store.list().length === 0) {
        const demo = [
          { template: 'noticia', title: 'El tranvía llega al centro este verano', subtitle: 'Movilidad', body: 'La nueva línea conecta el centro con los barrios del sur.', date: '24 jun 2026' },
          { template: 'titular', title: 'Vitoria, Capital Verde de Europa', subtitle: 'Ciudad' },
          { template: 'dato', title: '1.240', subtitle: 'Personas en las piscinas de Gamarra', body: 'Aforo actualizado cada 15 minutos', date: 'Actualizado 13:00' },
          { template: 'alerta', title: 'Corte de tráfico en la Avenida', subtitle: 'Tráfico', body: 'Desvíos por la calle Dato hasta las 18:00', date: 'Hoy' },
          { template: 'evento', title: 'Kaldearte: Ballet Aéreo Zenit', subtitle: 'Espectáculo', body: 'Plaza de la Virgen Blanca', date: 'Sábado 28 · 21:30 h' },
          { template: 'cita', title: 'Volar sobre la ciudad cambia para siempre tu mirada', subtitle: 'Iñigo Naya, Zenit Aerial' },
          { template: 'clima', title: '24ºC', subtitle: 'Soleado', body: 'Máx 28º · Mín 14º', date: 'Hoy' },
          { template: 'agenda', title: 'Agenda', body: '19:30 | Los Chunguitos Live | Jimmy Jazz\n20:00 | La Tremenda Pasarela Real | Teatro Félix Petite', date: 'Miércoles 24' },
          { template: 'foto', title: 'Atardecer sobre la Catedral', subtitle: 'Postal', date: '22:00' },
          { template: 'mensaje', title: 'Vitoria en verde.' },
        ];
        demo.forEach((c, i) => store.add({ type: 'generated', order: i + 1, ...c }));
        console.log(`Demo: ${demo.length} cartelas creadas (una por plantilla).`);
      } else {
        console.log('Demo: ya existen cartelas, no se crea nada.');
      }
      return publish({ dryRun: true });
    }
    default:
      console.log('Uso: node src/cli.js <comando> [--dry-run]\n' +
        '  Pipeline: generate | sequence | upload | import | publish | demo\n' +
        '  Admins:   admin:add <user> <pass> | admin:remove <user> | admin:list');
      process.exit(1);
  }
}

async function shutdown() { try { await require('./generator/htmlRender').close(); } catch {} }

main().then(async (r) => {
  await shutdown();
  process.exit(r && r.ok === false ? 2 : 0);
}).catch(async (e) => {
  console.error(e);
  await shutdown();
  process.exit(1);
});
