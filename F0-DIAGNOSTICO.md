# F0 — Diagnóstico y mapa del sistema (v0.149.7)

> Auditoría de solo-lectura previa a la estabilización 1.0. Nada de lo aquí
> señalado se ha tocado. Fecha: 2026-07-17.

## 1. Datos generales

- 172 commits entre el 25-jun y el 17-jul de 2026 (22 días, ~8 commits/día).
- **No existe ningún tag git.** El versionado vive solo en `package.json` (0.149.7).
- ~16.000 líneas propias: `public/app.js` (4.843) + `src/server.js` (1.271) +
  `src/rundown.js` (1.147) concentran la mitad del sistema.
- 30 commits son correcciones explícitas; 13 tocan caché/PWA/refresco. El
  patrón dominante del historial es: feature → regresión visual o de frescura →
  parche → parche del parche (ej.: 0.149.5 → 0.149.6 → 0.149.7, tres intentos
  seguidos contra el mismo síntoma de "plantilla ★ no aparece").
> Nota posterior: este documento conserva el diagnóstico de partida. La
> dimensión de paletas descrita aquí fue retirada después: ahora existe un
> único estilo cromático por plantilla.

- Working tree limpio. OJO: la `data/` de esta carpeta es la copia local de
  desarrollo; la `data/` real vive en el VPS. Cualquier prueba "con datos
  reales" debe partir de una copia traída del VPS o asumir esta divergencia.

## 2. Mapa de capas de diseño (el solape que hay que poder explicar en 3 frases)

Para pintar UNA cartela intervienen, en orden de prioridad (gana el de arriba):

1. **Layout propio de la cartela** (`card.layout`, etiquetado `design: v1|v2`;
   solo aplica si coincide con la versión activa).
2. **Plantilla propia ★** (`data/user-templates.json`): layout congelado +
   plantilla base; independiente de v1/v2.
3. **Layout predeterminado de plantilla** (+ excepciones por tema de color):
   `data/template-layouts.json` (v1) / `template-layouts.v2.json` (v2).
4. **Plantilla en código**: `src/generator/templates/` (v1) con overrides en
   `templates/v2/`; una plantilla sin v2 usa la v1.
5. Sobre el resultado actúan **reconciliación y reparación** automáticas
   (`reconcileSavedLayout`, `repairFrameForCard`, guardia de contraste).

El **color** se decide por otra cadena paralela: tema de la cartela → tema de
la pieza del banco / worker → tema del día elegido → tema por defecto de la
plantilla → paleta global de `config`.

El **contenido** por una tercera: `cards.json` es una *materialización*
derivada de escaleta (`rundown.json`) + bancos (`content-library.json`) +
workers (`worker-data.json`); y además es bidireccional: editar la cartela
"recuerda" cambios hacia su bloque (`rememberCardEdit`), convertirla reescribe
el guion (`convertCard`), y la agenda exprés es dueña de los eventos de su día.
El takeover es una capa final sobre `store.active()`.

**Diagnóstico**: cada capa está justificada y bien comentada, pero el conjunto
(3 cadenas × versionado v1/v2 × materialización bidireccional) es la principal
fábrica de sorpresas del tipo "no sale como lo pedí". Con v2 bendecido, F3
puede eliminar de raíz la dimensión v1/v2 (capas 3-4 se funden, `card.layout`
pierde la etiqueta, un solo archivo de layouts).

## 3. Inventario de endpoints (¿quién usa qué?)

~62 endpoints en `server.js`. Consumidores: `app.js` (panel), `editor.js`,
`review.js`, `galeria.html`, `espejo.html`, `login.html`, CLI.

**Huérfanos (nadie los llama desde el panel ni la CLI):**

- `PUT /api/rundown/day/:date` (`rundown.saveDay`) — sin llamador.
- `GET /api/workers` — el panel lee los workers vía `/api/autopilot`.
- `GET /api/audit` — el registro se escribe pero el panel usa `/api/log` y
  `/api/operations` (decidir en F3: exponer o retirar el endpoint).
- `GET /app.css` (ruta pre-login) — **el archivo `public/app.css` no existe**;
  los estilos van inline en cada HTML. Ruta muerta.

**Código muerto / cruft confirmado:**

- `src/webdrafts.js` — el propio archivo declara que es borrable.
- `design-preview/` — maquetas HTML estáticas de desarrollo.
- `pantalla-deploy.zip`, `pantalla-deploy-latest.zip`, `pantalla-update.zip`
  en la raíz (además cualquier `*.mp4` de la raíz se expone en la
  videoteca vía `/media/project-videos/`, cuidado con lo que se deja ahí).

## 4. Estado real de las defensas ya construidas

- **Contrato de pantalla**: sólido. `sequence` valida 8/8 MP4 antes de tocar
  `publish/`, `upload` no limpia el remoto, tanda anterior en
  `publish-anterior/`, historial deduplicado en `data/emisiones/` (15 días).
- **Caché del panel**: mitigada, no eliminada (ver riesgo nº 1).
- **Service worker**: correcto — no cachea nada a propósito; solo push.
- **QA existente**: `qa:templates` (16 plantillas × paletas × v1/v2, con
  matriz visual bajo `--render`) y `qa:rundown-order` (micro-test). No hay
  `npm test`, no hay e2e, nada prueba el panel (4.843 líneas sin una aserción).
- **Locks y guardias**: `pipelineLock` contra solapes, `renderGuard` modo
  seguro por memoria (<1,9 GB), janitor diario. Bien.

## 5. Riesgos, ordenados por probabilidad de volver a hacer sufrir

1. **PWA de iOS con JS viejo en memoria.** El servidor ya sirve HTML/JS con
   `no-cache` y `?v=<versión>`, pero una PWA instalada puede quedarse *días*
   con la página cargada sin recargar nunca: el JS antiguo sigue ejecutándose
   aunque el servidor tenga el nuevo. No hay banner "hay versión nueva" ni
   comparación cliente/servidor (el badge muestra la versión pero no avisa).
   Además el cache-busting usa la versión de `package.json`, no el contenido:
   un cambio sin subir versión no invalida nada. → F2.
2. **Deploy a ciegas.** `update-server.sh`: mata el proceso con `kill -9` y no
   arranca nada (depende de un supervisor externo que el script ni comprueba);
   el healthcheck es `curl ... || true` — **nunca falla**; no compara la
   versión desplegada; el rollback no está documentado. Un deploy roto se
   descubre a mano. → F2.
3. **Cero red de pruebas de los flujos reales.** Todo el calvario histórico
   (función en servidor que no aparece en panel, arreglos invisibles, solapes
   en producción) habría sido cazado por un humo e2e que hoy no existe. → F1.
4. **`data/` sin backup.** El script de deploy solo guarda 1 copia de la
   config en `$HOME` (y se sobrescribe). `cards/rundown/content-library/
   user-templates/emisiones` = el trabajo diario del usuario, sin copia ni
   restauración probada. → F2.
5. **Complejidad de capas de diseño** (sección 2). Origen documentado de
   regresiones pasadas (bancos que machacaban plantillas, layouts pisados,
   temas que no se aplicaban). Con v2 bendecido, gran parte se puede retirar
   limpiamente. → F3.
6. **Monolitos sin costuras.** `app.js` 4.843 líneas / `server.js` 1.271 /
   `rundown.js` 1.147: cada retoque puede romper otra cosa sin aviso; el humo
   de F1 es el cinturón antes de tocar nada.
7. **Divergencia local ↔ VPS.** Fuentes (el README aún manda instalar
   `fonts-liberation2` cuando ya van empaquetadas — instrucción obsoleta),
   memoria (modo seguro), Chromium de puppeteer. El "en local se ve bien" no
   garantiza producción; el humo post-deploy de F2 compensa.
8. **Jerga interna en la interfaz** (materializar, workers, slots, bumpers…)
   para una usuaria no técnica. → F3/F4.
9. **README desactualizado en puntos concretos** (fuentes, "Pendiente de tus
   datos" ya resuelto, ausencia de agenda exprés/takeover/emisiones en la
   puesta en marcha). → F5.

## 6. Qué NO haría falta tocar

`sequence`/`upload`/`emisiones`/`takeover`/`pipelineLock`/`sw.js`: diseño
correcto y defensivo; en F1-F2 solo se les añaden pruebas, no cambios.
