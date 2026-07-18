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

async function setupPost(url, options) {
  try {
    return await page.request.post(url, options);
  } catch (error) {
    // La conexión keep-alive de APIRequestContext puede cerrarse justo entre
    // dos pruebas largas en Windows. Solo se repite ese corte de transporte;
    // una respuesta HTTP errónea se devuelve intacta y hace fallar el humo.
    if (!/ECONNRESET/i.test(String(error && error.message))) throw error;
    await page.waitForTimeout(100);
    return page.request.post(url, options);
  }
}

async function ensureDetailsOpen(selector) {
  const details = page.locator(selector);
  await expect(details).toBeVisible();
  if (!(await details.evaluate((node) => node.open))) {
    await details.locator('summary').first().click();
  }
}

// ---------- 1. LOGIN ----------
test('login: entrar con usuario y contraseña y ver el panel con su versión', async () => {
  // Salir primero: /login redirige solo si ya hay sesión (la del beforeAll).
  await page.request.post('/api/logout');
  // El comprobador periódico del panel puede detectar la sesión cerrada y
  // navegar a /login en el mismo instante. Si ambas navegaciones tienen el
  // mismo destino no es un fallo: esperamos a que cualquiera de ellas llegue.
  try {
    await page.goto('/login');
  } catch (error) {
    if (!/interrupted by another navigation/i.test(String(error && error.message))) throw error;
  }
  await page.waitForURL('**/login');
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
  await page.fill('#aqText', `19:30 Concierto ${MARK} | Teatro Principal\nEXPO Mirar el agua ${MARK} | Montehermoso\n21:00 Cine al aire libre ${MARK} | Plaza España`);
  await page.click('#aqSave');
  await expect(page.locator('#aqDlg')).toBeHidden();
  await toastVisible(/agenda|guardad/i);

  // MAÑANA
  await page.click('#btnAgenda');
  await expect(page.locator('#aqDlg')).toBeVisible();
  await page.click('#aqTomorrow');
  await page.fill('#aqText', `20:00 Teatro ${MARK} | Principal Antzokia`);
  await page.click('#aqSave');
  await expect(page.locator('#aqDlg')).toBeHidden();
  await toastVisible(/agenda|guardad/i);

  // Relectura visible: al reabrir, el texto guardado sigue ahí (hoy).
  await page.click('#btnAgenda');
  await page.click('#aqToday');
  await expect(page.locator('#aqText')).toHaveValue(new RegExp(`Concierto ${MARK}`));
  await expect(page.locator('#aqText')).toHaveValue(new RegExp(`EXPO Mirar el agua ${MARK}`));
  await page.locator('#aqDlg .ghost').first().click(); // cerrar
});

// ---------- 3. PRÓXIMA TANDA: OCHO POSICIONES Y PENDIENTES RESOLUBLES ----------
test('preflight: Agenda y Foto vacías son 6/8 sin modificar la tanda', async () => {
  const current = await (await page.request.get('/api/rundown')).json();
  const cardsBefore = await (await page.request.get('/api/cards')).json();
  const library = structuredClone(current.library);
  library.agendaEventos = [];
  library.agendaBanco = [];
  library.fotosGasteizberri = [];
  const response = await page.request.post('/api/rundown/preflight', {
    data: { date: current.activeDate, rundown: current.rundown, library },
  });
  expect(response.ok()).toBeTruthy();
  const result = await response.json();
  expect(result.structuralCount).toBe(8);
  expect(result.readyCount).toBe(6);
  expect(result.blockers.map((item) => item.code)).toEqual(['agenda-empty', 'photo-empty']);

  const rejected = await page.request.post('/api/rundown/prepare', {
    data: { date: current.activeDate, rundown: current.rundown, library, agendaQuick: { text: '' } },
  });
  expect(rejected.status()).toBe(409);
  const after = await (await page.request.get('/api/rundown')).json();
  const cardsAfter = await (await page.request.get('/api/cards')).json();
  expect(after.rundown.updatedAt).toBe(current.rundown.updatedAt);
  expect(after.library.fotosGasteizberri).toEqual(current.library.fotosGasteizberri);
  expect(cardsAfter.map((card) => card.id)).toEqual(cardsBefore.map((card) => card.id));
});

test('próxima tanda: muestra las 8 posiciones y resuelve varias fotos sin salir', async () => {
  const state = await (await page.request.get('/api/rundown')).json();
  state.library.fotosGasteizberri = [];
  await page.request.put('/api/rundown/library', { data: state.library });
  await page.route('**/api/wp-media?**', async (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, page: 1, totalPages: 1, items: [
      { full: 'https://gasteizberri.com/qa-1.jpg', thumb: '/qa-1.jpg', title: 'Foto QA 1' },
      { full: 'https://gasteizberri.com/qa-2.jpg', thumb: '/qa-2.jpg', title: 'Foto QA 2' },
      { full: 'https://gasteizberri.com/qa-3.jpg', thumb: '/qa-3.jpg', title: 'Foto QA 3' },
    ] }),
  }));
  await page.route('**/api/wp-media/import', async (route) => {
    const body = route.request().postDataJSON();
    const name = body.url.includes('qa-2') ? 'qa-2.jpg' : 'qa-1.jpg';
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, photo: `data/uploads/${name}` }) });
  });
  await page.goto('/');
  await page.click('#btnRundown');
  await expect(page.locator('#wizardDlg')).toBeVisible();
  await expect(page.locator('#wzTitle')).toContainText('Próxima tanda');
  await expect(page.locator('#wzProgress')).toHaveText('7/8 listas');
  await expect(page.locator('.wz-lineup-card[data-wz-card-uid]')).toHaveCount(8);
  await expect(page.locator('#wzBody')).toContainText('Foto GasteizBerri: Faltan fotos');
  await expect(page.locator('[data-wz-issue]')).toHaveCount(1);
  expect(await page.locator('[data-wz-rotation]:visible').count()).toBeGreaterThan(0);

  await page.locator('[data-wz-picker-open]').first().click();
  await page.locator('[data-wz-choice-type="prevision"]').first().click();
  await expect(page.locator('.wz-lineup-head b').first()).toHaveText('Previsión');

  await page.click('[data-wz-photo-web]');
  await expect(page.locator('#wpDlg')).toBeVisible();
  await page.locator('[data-wp-full]').nth(0).click();
  await page.locator('[data-wp-full]').nth(1).click();
  await expect(page.locator('#wpAddSelected')).toHaveText('Añadir 2 foto(s)');
  await page.click('#wpAddSelected');
  await expect(page.locator('#wizardDlg')).toBeVisible();
  await expect(page.locator('.wz-photo-thumb')).toHaveCount(2);
  await expect(page.locator('#wzProgress')).toHaveText('8/8 listas');
  await expect(page.locator('#wzNext')).toHaveText('Crear vista previa · 8/8');

  // Cerrar no pierde el trabajo: el borrador vuelve al abrir.
  await page.click('#wzClose');
  await page.click('#btnRundown');
  await expect(page.locator('#wzBody')).toContainText('Borrador recuperado');
  await expect(page.locator('.wz-lineup-head b').first()).toHaveText('Previsión');
  await expect(page.locator('.wz-photo-thumb')).toHaveCount(2);
  await page.click('[data-wz-discard]');
  await expect(page.locator('.wz-lineup-head b').first()).toHaveText('Tiempo ahora');
  await page.click('#wzClose');
});

test('estado: enseña origen, última comprobación y dato de las fuentes automáticas', async () => {
  await page.goto('/');
  await page.click('#btnStatus');
  await expect(page.locator('#statusDlg')).toBeVisible();
  await expect(page.locator('#workerHealth')).toContainText('Open-Meteo');
  await expect(page.locator('#workerHealth')).toContainText(/Última comprobación|Último intento/);
  await expect(page.locator('#btnWorkerHealthRefresh')).toBeVisible();
  await page.keyboard.press('Escape');
});

test('recuperación: rollback e histórico muestran progreso y resultado persistente', async () => {
  await page.goto('/');
  await page.click('#btnStatus');
  await expect(page.locator('#statusDlg')).toBeVisible();
  const files = Array.from({ length: 8 }, (_, i) => `berri-${i + 1}.mp4`);

  await page.route('**/api/tanda', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ hasPrevious: true, files: [] }),
  }));
  await page.route('**/api/tanda/rollback', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 350));
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, upload: { ok: true, done: 8, count: 8, files, verify: { ok: true, checked: 8 } } }),
    });
  });
  await page.click('#btnRollback');
  await expect(page.locator('#screenOperationNotice')).toBeVisible();
  await expect(page.locator('#screenOperationNotice')).toContainText('Volviendo a la tanda anterior');
  await expect(page.locator('#screenOperationNotice')).toHaveClass(/ok/, { timeout: 5000 });
  await expect(page.locator('#screenOperationNotice')).toContainText('8/8 archivos subidos y verificados');
  await expect(page.locator('#screenOperationNotice')).toBeVisible(); // no desaparece como un toast
  await page.click('[data-screen-operation-close]');
  await expect(page.locator('#screenOperationNotice')).toBeHidden();

  await page.route('**/api/emisiones', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ items: [{
      id: 'qa-restore', publishedAt: new Date().toISOString(),
      items: files.map((file, order) => ({ order, file, title: file, poster: '', available: true })),
    }] }),
  }));
  await page.route('**/api/emisiones/qa-restore/restore', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 350));
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, count: 8, upload: { ok: true, done: 8, count: 8, files, verify: { ok: true, checked: 8 } } }),
    });
  });
  await page.click('#btnEmisiones');
  await expect(page.locator('#emDlg')).toBeVisible();
  await page.click('[data-em-restore="qa-restore"]');
  await expect(page.locator('#screenOperationNotice')).toBeVisible();
  await expect(page.locator('#screenOperationNotice')).toContainText('Restaurando la emisión elegida');
  await expect(page.locator('#screenOperationNotice')).toHaveClass(/ok/, { timeout: 5000 });
  await expect(page.locator('#screenOperationNotice')).toContainText('Emisión restaurada y en pantalla');
  await expect(page.locator('#emDlg')).toBeVisible(); // conserva el resultado delante del usuario

  await page.unroute('**/api/tanda');
  await page.unroute('**/api/tanda/rollback');
  await page.unroute('**/api/emisiones');
  await page.unroute('**/api/emisiones/qa-restore/restore');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
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
  await ensureDetailsOpen('.home-saved');
  await expect(page.locator('.home-saved-card', { hasText: MARK })).toBeVisible();

  // Editarla y comprobar que sigue claramente fuera de la tanda.
  const card = page.locator('.home-saved-card', { hasText: `Titular inicial ${MARK}` });
  await card.locator('[data-home-edit]').click();
  await expect(page.locator('#editor')).toBeVisible();
  await page.fill('#edTitleField', `Titular corregido ${MARK}`);
  await page.click('#btnSave');
  await toastVisible(/guardad|✓/i);
  const corrected = page.locator('.home-saved-card', { hasText: `Titular corregido ${MARK}` });
  // El guardado lanza la recarga de portada en segundo plano: esperar primero
  // al contenido nuevo evita abrir el <details> antiguo justo antes de que el
  // DOM sea sustituido por el resultado actualizado.
  await expect(corrected).toHaveCount(1);
  await ensureDetailsOpen('.home-saved');
  await expect(corrected).toBeVisible();
});

// ---------- 4. CONVERTIR manual ↔ worker ↔ carrusel ----------
test('convertir: la misma cartela pasa a dato automático, a carrusel y vuelve a manual', async () => {
  // Cartela propia para el experimento (autosuficiente aunque se ejecute solo).
  const seed = await setupPost('/api/cards', {
    data: { type: 'generated', template: 'noticia', title: `Convertible ${MARK}`, subtitle: 'Prueba', enabled: true, source: 'manual', duration: 8 },
  });
  expect(seed.ok()).toBeTruthy();
  await page.goto('/');
  await ensureDetailsOpen('.home-ops');
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
    data: { label: `Prueba ${MARK}`, baseTemplate: 'mensaje', layout: frame },
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
  // El recorrido anterior comprueba expresamente que «Descartar borrador» no
  // altera el banco. Por tanto este humo completa su propia Foto y no depende
  // de que producción ya tuviera una seleccionada.
  const state = await (await page.request.get('/api/rundown')).json();
  state.library.fotosGasteizberri = [{
    title: `Foto de prueba ${MARK}`,
    subtitle: '', body: '', template: 'foto', photo: 'assets/logo.png', date: '',
    enabled: true, start: '', end: '', startAt: '', endAt: '', dates: [], weekdays: [],
    notes: '', eventIds: [], showEventDates: true, hideExpired: false,
  }];
  const saved = await page.request.post('/api/rundown/prepare', { data: {
    date: state.activeDate,
    rundown: state.rundown,
    library: state.library,
    agendaQuick: { text: `19:30 | Concierto de prueba ${MARK} | Teatro Principal` },
  } });
  const savedBody = await saved.json();
  expect(saved.ok(), JSON.stringify(savedBody)).toBeTruthy();
  const inactive = await page.request.post('/api/cards', { data: {
    type: 'generated', template: 'mensaje', title: `Guardada ${MARK}`,
    enabled: false, source: 'manual', duration: 8,
  } });
  expect(inactive.ok()).toBeTruthy();
  await page.goto('/');
  await page.click('#btnDry');
  // Aserción visible: el aviso del panel confirma la prueba con sus archivos.
  await expect(page.locator('#toast')).toHaveText(/Prueba OK: \d+ archivo/, { timeout: 570000 });
  // Y el contrato: publish/ contiene exactamente 8 MP4 con nombres berri-N.
  const tanda = await (await page.request.get('/api/tanda')).json();
  const names = (tanda.files || []).map((f) => f.file).sort();
  expect(names).toHaveLength(8);
  for (let i = 1; i <= 8; i++) expect(names).toContain(`berri-${i}.mp4`);
  // Las cartelas manuales creadas en pruebas anteriores se conservan, pero ya
  // no se suman a la tanda ni provocan el antiguo "sobran cartelas".
  await expect(page.locator('#listSummary')).toContainText('8 en la tanda');
  await expect(page.locator('.home-saved > summary')).toContainText('Fuera de la tanda');
  await expect(page.locator('.home-saved-card', { hasText: `Guardada ${MARK}` })).toHaveCount(1);
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
  await expect(page.locator('#toast')).toHaveText(/Alerta exclusiva activa/i, { timeout: 240000 });
  // Aserción visible: al reabrir el diálogo, el panel enseña el takeover activo.
  await page.click('#btnBreaking');
  await expect(page.locator('#tkState')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('#tkState')).toContainText(/Alerta exclusiva activa/i);
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
