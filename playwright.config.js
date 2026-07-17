'use strict';
// HUMO E2E (F1): configuración de Playwright.
// - Arranca el servidor REAL en un puerto de pruebas (3900) en modo QA.
// - Usa el MISMO Chrome que ya usa el motor de render (puppeteer): cero
//   descargas extra y mismo motor en local y en el VPS.
// - El modo QA anula FTP y tareas de fondo desde el primer instante; además,
//   global-setup copia data/ y config/ y global-teardown lo restaura todo.
const { defineConfig } = require('@playwright/test');
const path = require('path');

const PORT = Number(process.env.PANTALLA_QA_PORT || 3900);

function chromePath() {
  if (process.env.PANTALLA_QA_CHROME) return process.env.PANTALLA_QA_CHROME;
  try {
    const p = require('puppeteer').executablePath();
    if (typeof p === 'string' && p) return p;
  } catch { /* sin puppeteer resoluble: playwright usará su propio chromium */ }
  return undefined;
}

module.exports = defineConfig({
  testDir: path.join(__dirname, 'tests', 'e2e'),
  workers: 1, // el servidor comparte estado en disco: humo SIEMPRE en serie
  timeout: 180000,
  expect: { timeout: 20000 },
  globalSetup: path.join(__dirname, 'tests', 'e2e', 'global-setup.js'),
  globalTeardown: path.join(__dirname, 'tests', 'e2e', 'global-teardown.js'),
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 390, height: 844 }, // iPhone: el panel es móvil-first
    launchOptions: { executablePath: chromePath(), args: ['--no-sandbox'] },
  },
  webServer: {
    command: 'node src/server.js',
    url: `http://127.0.0.1:${PORT}/api/whoami`,
    reuseExistingServer: false,
    timeout: 30000,
    env: { ...process.env, PORT: String(PORT), PANTALLA_QA: '1' },
  },
});
