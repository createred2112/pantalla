# F1 — Red de seguridad (humo e2e + matriz visual)

> A partir de ahora: **sin `npm test` en verde, no hay commit.**

## Qué hay

- **`npm test`** encadena: `qa:rundown-order` (unit) → `qa:templates` (auditoría
  estática de las 18 plantillas × 6 paletas × v1/v2, incluidas las ★) →
  `qa:e2e` (humo Playwright) → `qa:visual:check` (matriz visual con umbral).
- **Humo e2e** (`tests/e2e/humo.spec.js`): 9 tests en viewport de iPhone contra
  el servidor real en el puerto 3900 — login, agenda exprés (hoy y mañana),
  crear/editar cartela, convertir manual↔worker↔carrusel, plantilla ★ visible
  en el selector, publicación en seco con contrato 8×`berri-N.mp4`, takeover
  on y off, ajustes guardar/releer. Cada test acaba en una aserción visible.
- **Matriz visual** (`scripts/qa-visual-diff.js`): renderiza las hojas de
  `qa:templates:visual` y las compara píxel a píxel contra
  `tests/visual-baseline/` (umbral 0,1% por hoja; el render es determinista,
  medido 0,000% de ruido entre pasadas). En rojo deja el PNG de diferencias en
  `output/qa-visual-diff/`. Cambio intencionado → `npm run qa:visual:baseline`.

## Protecciones automáticas del humo

- `global-setup` fotografía `data/*.json` y `config/*.json`, **anula el FTP**,
  apaga piloto/autopublicación/push y crea el admin `qa-e2e`;
  `global-teardown` lo restaura todo. Si una pasada muere a medias, la
  siguiente restaura el snapshot huérfano antes de empezar. El humo no puede
  tocar la pantalla real ni dejar rastro en tus datos.
- El navegador del humo es el MISMO Chrome que usa el motor de render
  (puppeteer): nada nuevo que instalar. Se puede forzar otro con
  `PANTALLA_QA_CHROME=/ruta/a/chrome`.

## Primera ejecución en cada máquina

1. `npm install` (trae Playwright y pixelmatch como devDependencies).
2. `npm test` — la primera pasada renderiza todo (más lenta) y **aprueba la
   línea base visual** de esa máquina; desde la segunda ya compara de verdad.
   Duración estimada: 3-5 min en frío, ~1-2 min con caché.

## Arreglos hechos en F1 (cada uno con su red)

- **`qa:templates` daba rojo con datos reales**: los layouts predeterminados
  guardados por la usuaria (p. ej. ocultar la fecha en "evento") se colaban en
  la auditoría de las plantillas de serie. Ahora la auditoría las aísla y es
  determinista en cualquier máquina.
- **El servidor podía morir entero** si Chromium fallaba durante una
  publicación en segundo plano (takeover): promesa sin capturar → proceso
  caído → pantalla sin panel. Red puesta en `src/server.js` (el panel sigue en
  pie y lo registra); el arreglo de raíz en `htmlRender`/`video` queda anotado
  para F2/F3.

## Verificación de esta entrega (entorno: sandbox Linux, Node 22, copia VPS)

Todo en verde con los DATOS REALES del VPS (9 cartelas, 2 ★, 6 paletas):
unit OK · auditoría 2×108 combinaciones OK · humo 9/9 (34,7 s) · matriz 12
hojas 0,000%. Nota honesta (regla 4): el sandbox corta cada comando a 45 s,
así que la cadena completa de una sentada se verificó por eslabones; confirma
`npm test` del tirón en tu máquina. Las duraciones de vídeo se acortaron SOLO
en la copia de pruebas del sandbox, no en tus datos.
