'use strict';
// F2 — ENTREGA SIN DOLOR: la caché no puede volver a servir panel viejo.
// 1) Los assets van con huella de contenido y solo esas URLs se cachean.
// 2) Si el servidor cambia tras un deploy, el panel abierto avisa y recarga.
const { test, expect } = require('@playwright/test');

const USER = 'qa-e2e';
const PASS = 'humo-pantalla-qa';

test.describe.configure({ mode: 'serial' });

let page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.goto('/login');
  await page.fill('#u', USER);
  await page.fill('#p', PASS);
  await page.click('#f button');
  await page.waitForURL('**/');
});

test.afterAll(async () => { if (page) await page.close(); });

test('assets con huella: el HTML referencia app.js?v=<hash> y solo eso se cachea largo', async () => {
  const html = await (await page.request.get('/')).text();
  const m = html.match(/src="app\.js\?v=([0-9a-f]{10})"/);
  expect(m, 'el HTML debe referenciar app.js con huella de contenido').toBeTruthy();
  const hash = m[1];

  // Con huella correcta: caché larga e inmutable.
  const good = await page.request.get(`/app.js?v=${hash}`);
  expect(good.status()).toBe(200);
  expect(good.headers()['cache-control']).toContain('immutable');

  // Sin huella (o con huella vieja): nunca se cachea.
  const plain = await page.request.get('/app.js');
  expect(plain.headers()['cache-control']).toContain('no-cache');
  const stale = await page.request.get('/app.js?v=0000000000');
  expect(stale.headers()['cache-control']).toContain('no-cache');

  // El HTML y el service worker jamás se cachean.
  expect((await page.request.get('/')).headers()['cache-control']).toContain('no-cache');
  expect((await page.request.get('/sw.js')).headers()['cache-control']).toContain('no-cache');

  // La página conoce su huella (base del aviso de actualización) y coincide
  // con la que anuncia el servidor.
  const client = await page.evaluate(() => window.PANTALLA_CLIENT);
  expect(client && client.assets).toMatch(/^[0-9a-f]{10}$/);
  const who = await (await page.request.get('/api/whoami')).json();
  expect(who.assets).toBe(client.assets);
});

test('aviso de actualización: si el servidor tiene otra huella, banner y recarga', async () => {
  await page.goto('/');
  // Simular "el servidor cambió tras un deploy": la página cree haber nacido
  // con otra huella y ejecuta la misma comprobación que dispara la PWA al
  // volver a primer plano.
  await page.evaluate(() => { window.PANTALLA_CLIENT.assets = 'obsoleta999'; });
  await page.evaluate(() => window.checkPanelUpdate());
  await expect(page.locator('#updateBanner')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#updateBanner')).toContainText(/versión nueva/i);
  // El botón recarga de verdad: tras el reload, la página vuelve a nacer con
  // la huella buena y el banner ya no está.
  await page.click('#updateBannerReload');
  await page.waitForLoadState('load');
  await expect(page.locator('#updateBanner')).toHaveCount(0);
  const client = await page.evaluate(() => window.PANTALLA_CLIENT);
  const who = await (await page.request.get('/api/whoami')).json();
  expect(client.assets).toBe(who.assets);
});
