'use strict';
// Capturas reproducibles del manual. Reutiliza el servidor QA y su snapshot:
// no toca FTP ni deja cambios en data/config al terminar.
const path = require('path');
const base = require('./playwright.config');

module.exports = {
  ...base,
  testDir: path.join(__dirname, 'tests', 'manual'),
  testMatch: '**/*.spec.js',
  timeout: 120000,
  reporter: [['list']],
};
