'use strict';
// MATRIZ VISUAL CON UMBRAL (F1): compara las matrices de plantillas
// (output/qa-template-matrix-v1|v2/<paleta>.png) contra una línea base
// aprobada, píxel a píxel. Si algo cambia más del umbral, FALLA y deja un
// PNG de diferencias para mirar con los ojos.
//
// Uso:
//   node scripts/qa-visual-diff.js --baseline   (re)aprueba lo actual como base
//   node scripts/qa-visual-diff.js              renderiza + compara (npm run qa:visual:check)
//   node scripts/qa-visual-diff.js --no-render  compara sin re-renderizar
//
// La línea base vive en tests/visual-baseline/ (fuera de git por peso; cada
// máquina aprueba la suya). Sin línea base todavía: la primera pasada la crea
// y avisa — la segunda ya compara de verdad.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch').default || require('pixelmatch');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'output');
const BASE = path.join(ROOT, 'tests', 'visual-baseline');
const DIFF_DIR = path.join(OUT, 'qa-visual-diff');
// Umbral: % de píxeles distintos tolerado por hoja. El anti-aliasing del
// render varía un pelo entre pasadas; 0.10% lo absorbe, un solape o un texto
// movido lo dispara de sobra.
const MAX_DIFF_PCT = Number(process.env.PANTALLA_QA_VISUAL_PCT || 0.10);
// Diseño v1 retirado (F3): solo se compara el diseño vivo.
const VERSIONS = ['v2'];

function matrixDir(version) { return path.join(OUT, `qa-template-matrix-${version}`); }

function render() {
  const r = spawnSync(process.execPath, [path.join(__dirname, 'qa-template-matrix.js'), '--render'], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error('FALLO: no se pudo generar la matriz visual');
    process.exit(1);
  }
}

function sheets(version) {
  const dir = matrixDir(version);
  try { return fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort(); } catch { return []; }
}

function approveBaseline() {
  fs.rmSync(BASE, { recursive: true, force: true });
  for (const v of VERSIONS) {
    const dest = path.join(BASE, v);
    fs.mkdirSync(dest, { recursive: true });
    for (const f of sheets(v)) fs.copyFileSync(path.join(matrixDir(v), f), path.join(dest, f));
  }
  console.log(`Línea base visual aprobada en ${BASE}`);
}

function compare() {
  let failures = 0;
  let compared = 0;
  fs.rmSync(DIFF_DIR, { recursive: true, force: true });
  for (const v of VERSIONS) {
    for (const f of sheets(v)) {
      const baseFile = path.join(BASE, v, f);
      if (!fs.existsSync(baseFile)) { console.log(`AVISO [${v}/${f}]: sin línea base, se omite`); continue; }
      const a = PNG.sync.read(fs.readFileSync(baseFile));
      const b = PNG.sync.read(fs.readFileSync(path.join(matrixDir(v), f)));
      if (a.width !== b.width || a.height !== b.height) {
        console.error(`ROJO [${v}/${f}]: el tamaño de la hoja cambió (${a.width}x${a.height} → ${b.width}x${b.height})`);
        failures++; continue;
      }
      const diff = new PNG({ width: a.width, height: a.height });
      const bad = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.12 });
      const pct = (bad / (a.width * a.height)) * 100;
      compared++;
      if (pct > MAX_DIFF_PCT) {
        fs.mkdirSync(DIFF_DIR, { recursive: true });
        const out = path.join(DIFF_DIR, `${v}-${f}`);
        fs.writeFileSync(out, PNG.sync.write(diff));
        console.error(`ROJO [${v}/${f}]: ${pct.toFixed(3)}% de píxeles distintos (umbral ${MAX_DIFF_PCT}%) → ${out}`);
        failures++;
      } else {
        console.log(`ok   [${v}/${f}]: ${pct.toFixed(3)}% de diferencia`);
      }
    }
  }
  if (failures) {
    console.error(`\nMatriz visual: ${failures} hoja(s) con cambios por encima del umbral.`);
    console.error('Si el cambio es INTENCIONADO: npm run qa:visual:baseline para aprobar el nuevo aspecto.');
    process.exit(1);
  }
  console.log(`\nMatriz visual en verde (${compared} hoja(s) comparadas).`);
}

const wantBaseline = process.argv.includes('--baseline');
if (!process.argv.includes('--no-render')) render();
if (wantBaseline) { approveBaseline(); process.exit(0); }
if (!fs.existsSync(BASE)) {
  approveBaseline();
  console.log('No había línea base: la de esta pasada queda aprobada. La PRÓXIMA ejecución ya compara.');
  process.exit(0);
}
compare();
