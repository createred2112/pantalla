'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const required = [
  'README.md', 'CHANGELOG.md', 'F5-SELLO-1.0.md', 'docs/RUNBOOK.md',
  'docs/manual/README.md', 'docs/manual/01-agenda.md',
  'docs/manual/02-proxima-tanda.md', 'docs/manual/03-retocar-estilo.md',
  'docs/manual/04-publicar.md',
];

for (const rel of required) {
  assert(fs.existsSync(path.join(ROOT, rel)), `falta documentación: ${rel}`);
}

for (const rel of required.filter((file) => file.endsWith('.md'))) {
  const file = path.join(ROOT, rel);
  const source = fs.readFileSync(file, 'utf8');
  const links = [...source.matchAll(/!?(?:\[[^\]]*\])\(([^)]+)\)/g)].map((match) => match[1]);
  for (let target of links) {
    target = target.trim().replace(/^<|>$/g, '').split('#')[0];
    if (!target || /^(?:https?:|mailto:)/i.test(target)) continue;
    const resolved = path.resolve(path.dirname(file), decodeURIComponent(target));
    assert(fs.existsSync(resolved), `enlace roto en ${rel}: ${target}`);
  }
}

const runbook = fs.readFileSync(path.join(ROOT, 'docs', 'RUNBOOK.md'), 'utf8');
assert.strictEqual((runbook.match(/^\d+\. /gm) || []).length, 10, 'el runbook debe tener exactamente 10 pasos');

const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
for (const stale of ['## Temas de color', 'selector + muestras de color', 'fonts-liberation2', '## Pendiente de tus datos']) {
  assert(!readme.includes(stale), `README conserva instrucción antigua: ${stale}`);
}

const changelog = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
assert(changelog.includes('0.100') && changelog.includes('0.152.0'), 'el changelog no cubre 0.100 → 0.152.0');

console.log('OK: manual, capturas, enlaces, changelog y runbook de 10 pasos');
