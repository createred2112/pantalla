'use strict';
// Reproduce la carrera real: ya hay Chromium, entra un trabajo nuevo y a la
// vez otra ruta pide cerrar el motor. El trabajo debe terminar antes del cierre
// y no puede escapar ninguna promesa rechazada al proceso.
const html = require('../src/generator/htmlRender');

let unhandled = null;
process.on('unhandledRejection', (error) => { unhandled = error; });
const guard = setTimeout(() => {
  console.error('El cierre y el render quedaron bloqueados entre sí');
  process.exit(1);
}, 20000);

(async () => {
  for (let i = 0; i < 4; i++) {
    await html.browser();
    const work = html.withPage(async (page) => {
      await page.setViewport({ width: 320, height: 180, deviceScaleFactor: 1 });
      await page.setContent(`<title>ronda-${i}</title><b>OK</b>`);
      return page.title();
    });
    const shutdown = new Promise((resolve) => setTimeout(resolve, 0)).then(() => html.close());
    const [title] = await Promise.all([work, shutdown]);
    if (title !== `ronda-${i}`) throw new Error(`render incompleto en ronda ${i}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 20));
  if (unhandled) throw unhandled;
  clearTimeout(guard);
  console.log('OK: cerrar Chromium espera al render activo y no filtra rechazos');
})().catch(async (error) => {
  clearTimeout(guard);
  console.error(error.stack || error.message);
  try { await html.close(); } catch {}
  process.exit(1);
});
