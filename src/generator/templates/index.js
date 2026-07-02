'use strict';
// Registro de plantillas. Añadir una nueva = crear su archivo y listarlo aquí.
const lib = require('./_lib');

const modules = [
  require('./noticia'),
  require('./titular'),
  require('./dato'),
  require('./luz'),
  require('./gasolina'),
  require('./alerta'),
  require('./evento'),
  require('./cita'),
  require('./clima'),
  require('./foto'),
  require('./agenda'),
  require('./mensaje'),
];

const byId = new Map(modules.map((m) => [m.id, m]));

function get(id) {
  return byId.get(id) || byId.get('noticia');
}

// Lista para el panel (id, etiqueta, pistas de campos).
function list() {
  return modules.map((m) => ({ id: m.id, label: m.label, hint: m.hint || {}, logo: m.logo !== false, defaultTheme: m.defaultTheme || null }));
}

module.exports = { get, list, lib };
