'use strict';
// F4: ergonomía de la PWA en el tamaño real de un iPhone. Estas pruebas no
// intentan imitar Safari; blindan la geometría que antes dejaba controles o el
// lienzo fuera del área visible al girar el teléfono o abrir un formulario.
const { test, expect } = require('@playwright/test');

const USER = 'qa-e2e';
const PASS = 'humo-pantalla-qa';

async function login(page) {
  await page.goto('/login');
  await page.fill('#u', USER);
  await page.fill('#p', PASS);
  await page.click('#f button');
  await page.waitForURL('**/');
}

async function insideViewport(locator, page) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box).toBeTruthy();
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
}

test('iPhone vertical: agenda conserva cabecera, campo y guardar al abrirse', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await login(page);
  await page.click('#btnAgenda');
  await expect(page.locator('#aqDlg')).toBeVisible();
  // Reproduce una respuesta larga de sugerencias: fue la que empujó Guardar
  // a y=3203 cuando el diálogo no tenía cuerpo desplazable.
  await page.locator('#aqWebList').evaluate((box) => {
    box.innerHTML = Array.from({ length: 40 }, (_, i) => `<button type="button">Sugerencia extensa ${i + 1}</button>`).join('');
  });
  await page.focus('#aqText');
  await insideViewport(page.locator('#aqDlg .dlg-h'), page);
  await insideViewport(page.locator('#aqSave'), page);
  await page.close();
});

test('iPhone horizontal: el asistente completo cabe y conserva su botonera', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
  await login(page);
  await page.click('#btnRundown');
  await expect(page.locator('#wizardDlg')).toBeVisible();
  await insideViewport(page.locator('#wizardDlg'), page);
  await insideViewport(page.locator('#wzClose'), page);
  await insideViewport(page.locator('#wzNext'), page);
  await page.close();
});

test('editor táctil: lienzo y controles son utilizables en vertical y horizontal', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await login(page);
  const cards = await (await page.request.get('/api/cards')).json();
  const card = (Array.isArray(cards) ? cards : cards.cards || []).find((item) => item.type === 'generated');
  expect(card).toBeTruthy();
  await page.goto(`/editor.html?id=${encodeURIComponent(card.id)}`);
  await expect(page.locator('#canvasWrap')).toBeVisible();
  await expect(page.locator('.side')).toBeVisible();
  const portrait = await page.evaluate(() => {
    const stage = document.querySelector('.stage').getBoundingClientRect();
    const side = document.querySelector('.side').getBoundingClientRect();
    return { stage, side };
  });
  expect(portrait.stage.width).toBeGreaterThan(340);
  expect(portrait.side.width).toBeGreaterThan(340);
  expect(portrait.side.top).toBeGreaterThanOrEqual(portrait.stage.bottom - 1);

  await page.setViewportSize({ width: 844, height: 390 });
  const landscape = await page.evaluate(() => {
    const stage = document.querySelector('.stage').getBoundingClientRect();
    const side = document.querySelector('.side').getBoundingClientRect();
    return { stage, side };
  });
  expect(landscape.stage.width).toBeGreaterThan(450);
  expect(landscape.side.width).toBeGreaterThanOrEqual(285);
  expect(Math.abs(landscape.side.top - landscape.stage.top)).toBeLessThan(2);
  await insideViewport(page.locator('#btnSave'), page);
  await page.close();
});
