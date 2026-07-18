'use strict';
// Registro de plantillas. Añadir una nueva = crear su archivo y listarlo aquí.
//
// El diseño vivo es el GIGANTE (./v2). Los archivos de este directorio son su
// base interna y aportan metadatos o una implementación de respaldo.
const lib = require('./_lib');

const modules = [
  require('./noticia'),
  require('./titular'),
  require('./dato'),
  require('./datocurioso'),
  require('./aire'),
  require('./luz'),
  require('./gasolina'),
  require('./alerta'),
  require('./meteoaviso'),
  require('./evento'),
  require('./cita'),
  require('./clima'),
  require('./prevision'),
  require('./foto'),
  require('./agenda'),
  require('./mensaje'),
];

// Implementaciones GIGANTE. Si falta alguna, se usa su módulo base.
const v2ById = new Map();
for (const m of modules) {
  try {
    const alt = require(`./v2/${m.id}`);
    if (alt && alt.id === m.id && typeof alt.build === 'function') v2ById.set(m.id, alt);
  } catch { /* sin implementación GIGANTE: se usa la base */ }
}

const v1ById = new Map(modules.map((m) => [m.id, m]));

// Se conserva como parte del contrato de metadatos y firmas de los MP4.
function designVersion() {
  return 'v2';
}

function activeModules() {
  return modules.map((m) => v2ById.get(m.id) || m);
}

function builtinGet(id) {
  const base = v1ById.get(id) || v1ById.get('noticia');
  return v2ById.get(base.id) || base;
}

// Plantillas PROPIAS del usuario (guardadas desde el editor visual): se
// comportan como la plantilla base pero con su composición congelada dentro.
function userModule(rec) {
  const base = builtinGet(rec.base);
  return {
    ...base,
    id: rec.id,
    label: '★ ' + rec.label,
    defaultTheme: base.defaultTheme || null,
    userLayout: rec.layout,
    userBase: rec.base,
  };
}

function userModules() {
  try { return require('../../userTemplates').list().map(userModule); } catch { return []; }
}

function get(id) {
  if (String(id || '').startsWith('u_')) {
    try {
      const rec = require('../../userTemplates').get(id);
      if (rec) return userModule(rec);
    } catch { /* cae a la de serie */ }
  }
  return builtinGet(id);
}

// Lista para el panel (id, etiqueta, pistas de campos).
function list() {
  return [...activeModules(), ...userModules()].map((m) => ({ id: m.id, label: m.label, hint: m.hint || {}, logo: m.logo !== false, defaultTheme: m.defaultTheme || null, user: String(m.id).startsWith('u_') || undefined }));
}

module.exports = { get, list, lib, designVersion };
