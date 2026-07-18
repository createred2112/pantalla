'use strict';
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const USER = 'qa-e2e';
const PASS = 'humo-pantalla-qa';
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'manual', 'img');
const VERSION = require('../../package.json').version;

test('capturas del manual de usuario', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.goto('/login');
  await page.fill('#u', USER);
  await page.fill('#p', PASS);
  await page.click('#f button');
  await page.waitForURL('**/');
  await expect(page.locator('#versionBadge')).toContainText('v' + VERSION);

  await page.locator('.today-panel').screenshot({ path: path.join(OUT, 'publicar.png') });

  await page.click('#btnAgenda');
  await expect(page.locator('#aqDlg')).toBeVisible();
  await page.locator('#aqDlg').screenshot({ path: path.join(OUT, 'agenda.png') });
  await page.locator('#aqDlg .dlg-h button').click();

  await page.click('#btnRundown');
  await expect(page.locator('#wizardDlg')).toBeVisible();
  await page.locator('#wizardDlg').screenshot({ path: path.join(OUT, 'tanda.png') });
  await page.click('#wzClose');

  const payload = await (await page.request.get('/api/cards')).json();
  const cards = Array.isArray(payload) ? payload : payload.cards || [];
  const card = cards.find((item) => item.type === 'generated');
  expect(card).toBeTruthy();
  await page.goto(`/editor.html?id=${encodeURIComponent(card.id)}`);
  await expect(page.locator('#canvasWrap')).toBeVisible();
  await page.screenshot({ path: path.join(OUT, 'estilo.png'), fullPage: false });
});
