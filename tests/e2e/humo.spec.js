'use strict';
// HUMO END-TO-END de LA PANTALLA (F1).
// Recorre los flujos reales del panel como lo haría la usuaria, en un viewport
// de iPhone, contra el servidor real con los datos vivos (protegidos por el
// snapshot del global-setup). Cada flujo termina en una aserción VISIBLE.
//
// Regla de oro: si uno de estos tests se pone rojo, NO se hace commit.
const { test, expect } = require('@playwright/test');

const USER = 'qa-e2e';
const PASS = 'humo-pantalla-qa';
const MARK = 'QA-HUMO-9381'; // marca única para reconocer lo creado por el humo

test.describe.configure({ mode: 'serial' });

let page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  // Los confirm() del panel (convertir, rollback...) se aceptan siempre.
  page.on('dialog', (d) => d.accept());
  // Sesión abierta de serie: cada test es autosuficiente (también filtrado
  // con -g). El flujo de login COMPLETO se prueba igualmente en el test 1.
  await page.goto('/login');
  await page.fill('#u', USER);
  await page.fill('#p', PASS);
  await page.click('#f button');
  await page.waitForURL('**/');
});

test.afterAll(async () => {
  if (page) await page.close();
});

async function toastVisible(re) {
  await expect(page.locator('#toast')).toHaveText(re, { timeout: 30000 });
}

// ---------- 1. LOGIN ----------
test('login: entrar con usuario y contraseña y ver el panel con su versión', async () => {
  // Salir primero: /login redirige solo si ya hay sesión (la del beforeAll).
  await page.request.post('/api/logout');
  await page.goto('/login');
  await page.fill('#u', USER);
  await page.fill('#p', PASS);
  await page.click('#f button[type="submit"], #f button');
  await page.waitForURL('**/');
  // Aserción visible: el badge de versión del panel muestra la versión real.
  const pkg = require('../../package.json');
  await expect(page.locator('#versionBadge')).toHaveText('v' + pkg.version);
});

// ---------- 2. AGENDA EXPRÉS (hoy y mañana) ----------
test('agenda exprés: guardar hoy y mañana y releerlas', async () => {
  await page.goto('/');
  await page.click('#btnAgenda');
  await expect(page.locator('#aqDlg')).toBeVisible();

  // HOY
  await page.click('#aqToday');
  await page.fill('#aqText', `19:30 Concierto ${MARK} | Teatro Principal\n21:00 Cine al aire libre ${MARK} | Plaza España`);
  await page.click('#aqSave');
  await toastVisible(/agenda|guardad/i);

  // MAÑANA
  await page.click('#btnAgenda');
  await expect(page.locator('#aqDlg')).toBeVisible();
  await page.click('#aqTomorrow');
  await page.fill('#aqText', `20:00 Teatro ${MARK} | Principal Antzokia`);
  await page.click('#aqSave');
  await toastVisible(/agenda|guardad/i);

  // Relectura visible: al reabrir, el texto guardado sigue ahí (hoy).
  await page.click('#btnAgenda');
  await page.click('#aqToday');
  await expect(page.locator('#aqText')).toHaveValue(new RegExp(`Concierto ${MARK}`));
  await page.locator('#aqDlg .ghost').first().click(); // cerrar
});

// ---------- 3. CREAR Y EDITAR UNA CARTELA ----------
test('editar cartela: crear una manual, cambiarle el titular y verlo en el panel', async () => {
  await page.goto('/');
  await page.click('#btnAdd');
  await expect(page.locator('#editor')).toBeVisible();
  await page.fill('#edTitleField', `Titular inicial ${MARK}`);
  await page.fill('#edSubtitle', 'Prueba');
  await page.click('#btnSave');
  await toastVisible(/guardad|creada|✓/i);
  await expect(page.locator('#list .card', { hasText: MARK })).toBeVisible();

  // Editarla con el lápiz y comprobar que el cambio SE VE en la lista.
  const card = page.locator('#list .card', { hasText: `Titular inicial ${MARK}` });
  await card.locator('[data-edit]').click();
  await expect(page.locator('#editor')).toBeVisible();
  await page.fill('#edTitleField', `Titular corregido ${MARK}`);
  await page.click('#btnSave');
  await toastVisible(/guardad|✓/i);
  await expect(page.locator('#list .card', { hasText: `Titular corregido ${MARK}` })).toBeVisible();
});

// ---------- 4. CONVERTIR manual ↔ worker ↔ carrusel ----------
test('convertir: la misma cartela pasa a dato automático, a carrusel y vuelve a manual', async () => {
  // Cartela propia para el experimento (autosuficiente aunque se ejecute solo).
  const seed = await page.request.post('/api/cards', {
    data: { type: 'generated', template: 'noticia', title: `Convertible ${MARK}`, subtitle: 'Prueba', enabled: true, source: 'manual', duration: 8 },
  });
  expect(seed.ok()).toBeTruthy();
  await page.goto('/');
  const openEditorOf = async (text) => {
    await page.locator('#list .card', { hasText: text }).first().locator('[data-edit]').click();
    await expect(page.locator('#editor')).toBeVisible();
  };

  // manual → worker (tiempo ahora)
  await openEditorOf(`Convertible ${MARK}`);
  await page.selectOption('#edSource', 'worker:weather');
  await toastVisible(/convertida/i);
  await expect(page.locator('#editor')).toBeVisible(); // reabre con la cartela fresca
  await expect(page.locator('#edSource')).toHaveValue('worker:weather');

  // worker → carrusel (datos curiosos)
  await page.selectOption('#edSource', 'lib:datosCuriosos');
  await toastVisible(/convertida/i);
  await expect(page.locator('#edSource')).toHaveValue('lib:datosCuriosos');

  // carrusel → manual (el contenido visible queda congelado)
  await page.selectOption('#edSource', 'manual');
  await toastVisible(/convertida/i);
  await expect(page.locator('#edSource')).toHaveValue('manual');
  await page.locator('#editor .dlg-h .ghost, #editor [onclick*="close"]').first().click().catch(() => {});
  await page.keyboard.press('Escape');
});

// ---------- 5. PLANTILLA PROPIA ★ visible en el selector ----------
test('plantilla ★: al guardarla aparece inmediatamente en el selector del editor', async () => {
  // Se crea con la API autenticada de la misma sesión (el editor visual táctil
  // se cubre aparte); lo que este humo blinda es la regresión real de 0.149.x:
  // "guardé la plantilla y el selector no la enseñaba".
  const frame = { elements: [{ id: 'title', type: 'text', x: 6, y: 40, w: 88, h: 20, size: 9, align: 'left' }] };
  const r = await page.request.post('/api/templates/custom', {
    data: { label: `Prueba ${MARK}`, baseTemplate: 'mensaje', layout: frame, theme: 'lima' },
  });
  expect(r.ok()).toBeTruthy();
  const created = await r.json();
  expect(created.ok).toBeTruthy();

  // SIN recargar a mano: abrir el editor debe enseñar la plantilla nueva.
  await page.goto('/');
  await page.click('#btnAdd');
  await expect(page.locator('#editor')).toBeVisible();
  await expect(page.locator('#edTemplate option', { hasText: `Prueba ${MARK}` })).toHaveCount(1);
  await page.keyboard.press('Escape');
});

// ---------- 6. PUBLICACIÓN EN SECO (dry-run) ----------
test('publicar en seco: la tanda completa se prepara y se anuncia 8/8', async () => {
  test.setTimeout(600000); // la primera vez puede tener que renderizar todo
  await page.goto('/');
  await page.click('#btnDry');
  // Aserción visible: el aviso del panel confirma la prueba con sus archivos.
  await expect(page.locator('#toast')).toHaveText(/Prueba OK: \d+ archivo/, { timeout: 570000 });
  // Y el contrato: publish/ contiene exactamente 8 MP4 con nombres berri-N.
  const tanda = await (await page.request.get('/api/tanda')).json();
  const names = (tanda.files || []).map((f) => f.file).sort();
  expect(names).toHaveLength(8);
  for (let i = 1; i <= 8; i++) expect(names).toContain(`berri-${i}.mp4`);
});

// ---------- 7. TAKEOVER: encender ----------
test('takeover on: la alerta ocupa la pantalla y el panel lo enseña', async () => {
  test.setTimeout(300000); // renderiza la alerta y prepara la tanda entera
  await page.goto('/');
  await page.click('#btnBreaking');
  await expect(page.locator('#breakingDlg')).toBeVisible();
  await page.fill('#bkInput', `Aviso urgente ${MARK}`);
  await page.check('#tkOn');
  await page.selectOption('#tkMinutes', '15');
  await page.click('#bkGo');
  await expect(page.locator('#toast')).toHaveText(/TAKEOVER activo/i, { timeout: 240000 });
  // Aserción visible: al reabrir el diálogo, el panel enseña el takeover activo.
  await page.click('#btnBreaking');
  await expect(page.locator('#tkState')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('#tkState')).toContainText(/takeover activo/i);
  await page.keyboard.press('Escape');
  const st = await (await page.request.get('/api/takeover')).json();
  expect(st.active).toBeTruthy();
});

// ---------- 7b. TAKEOVER: apagar ----------
test('takeover off: la pantalla vuelve a la programación normal', async () => {
  test.setTimeout(300000);
  // Autosuficiente: si no hay takeover activo (p. ej. ejecutado en solitario),
  // se activa primero por la API de la misma sesión.
  let st = await (await page.request.get('/api/takeover')).json();
  if (!st.active) {
    const r = await page.request.post('/api/takeover', {
      data: { title: `Aviso urgente ${MARK}`, minutes: 15, mode: 'full' },
      timeout: 240000,
    });
    expect(r.ok()).toBeTruthy();
  }
  await page.goto('/');
  await page.click('#btnBreaking'); // el botón de terminar vive en este diálogo
  await expect(page.locator('#tkOff')).toBeVisible({ timeout: 60000 });
  await page.click('#tkOff');
  await toastVisible(/normal|terminad|vuelto|✓/i);
  st = await (await page.request.get('/api/takeover')).json();
  expect(st.active).toBeFalsy();
});

// ---------- 8. AJUSTES: guardar y releer ----------
test('ajustes: un cambio guardado sobrevive a cerrar y reabrir', async () => {
  await page.goto('/');
  await page.click('#btnSettings');
  await expect(page.locator('#settingsDlg')).toBeVisible();
  const nota = `Nota del humo ${MARK} ${Date.now()}`;
  await page.fill('#setProfileNotes', nota);
  await page.click('#btnSetSave');
  await toastVisible(/guardad|ajustes|✓/i);
  // Releer: cerrar, reabrir y encontrar exactamente lo guardado.
  await page.keyboard.press('Escape');
  await page.click('#btnSettings');
  await expect(page.locator('#setProfileNotes')).toHaveValue(nota);
  await page.keyboard.press('Escape');
});
