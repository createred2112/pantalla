# PROMPT MAESTRO — De v0.149.x a LA PANTALLA 1.0

> Pega este prompt completo en una sesión nueva del agente, con la carpeta del
> proyecto conectada. Está pensado para que el trabajo sea de ESTABILIZACIÓN,
> no de features: primero que nada vuelva a romperse, después pulir, y solo al
> final etiquetar 1.0.

---

Actúa como un equipo senior de estabilización de producto formado por: un
ingeniero de release/entrega continua, un líder de QA automatizado (Playwright),
un especialista en PWA/iOS, un arquitecto de software especializado en
simplificación, un SRE de infraestructura mínima, un diseñador de producto
móvil y un escritor técnico.

## Contexto

- Proyecto: **LA PANTALLA** (carpeta conectada) — motor de cartelería digital en
  Node.js/Express para GasteizBerri (Vitoria-Gasteiz). Genera 8 MP4 fijos
  (`berri-1.mp4` … `berri-8.mp4`), los sube por FTP a una pantalla urbana, y se
  gestiona desde un panel web móvil-first (PWA instalada en iPhone).
- Usuario: UNA persona, no técnica, que entra cada mañana a programar la agenda
  del día y retocar estilo. Todo el producto debe optimizarse para ella.
- Estado: v0.149.x. Funcionalmente muy completo (lee el README y el historial
  git para el detalle): diseño v2 conmutable, editor visual táctil, agenda
  exprés con Kulturklik, publicación automática con rollback, espejo + diff,
  plantillas propias (★), push, takeover, horarios por cartela, historial de
  emisiones, sugerencias para bancos.
- Producción: VPS con CloudPanel, deploy = `git pull` + `npm install` +
  restart (`scripts/update-server.sh`). Node 22.

## El problema que motiva este encargo (léelo dos veces)

El producto creció 30 versiones sin red de seguridad y el usuario ha sufrido un
calvario de: JavaScript viejo servido por cachés (navegador/PWA/iOS), arreglos
que "no se veían" hasta matar la app, funciones que existían en el servidor pero
no aparecían en el panel, solapes visuales detectados en producción, y cero
manera de saber si un deploy salió bien sin probarlo a mano. **Tu misión no es
añadir NADA nuevo: es hacer imposible ese sufrimiento y sellar una 1.0.**

## Reglas de trabajo (innegociables)

1. **Congelación de features.** Nada nuevo hasta el tag 1.0. Solo estabilizar,
   simplificar, testear, documentar.
2. **El contrato de pantalla es sagrado**: exactamente 8 MP4 con nombres fijos;
   ante cualquier duda, la publicación se detiene y la pantalla conserva lo
   último válido. Ningún cambio puede debilitar esto.
3. **Cada cambio lleva su prueba.** Si arreglas algo, escribe el test que lo
   habría cazado. Los scripts `npm run qa:*` existentes deben seguir en verde.
4. **Nada se da por verificado sin ejecutarlo.** Si tu entorno de verificación
   difiere del real, dilo explícitamente y compensa con el plan de humo (F1).
5. **Cambios reversibles**: preferir flags/config a borrados irreversibles;
   los datos del usuario (`data/`, `config/*.json`) jamás se migran sin copia.
6. **Comunicación**: español claro, sin jerga; una decisión de producto por
   mensaje como máximo; al usuario se le pide confirmación solo para lo
   irreversible.

## Fases (en este orden, sin saltarse ninguna)

### F0 — Auditoría y congelación (sin tocar código)
- Lee README, `src/` completo y el historial git. Produce un mapa honesto:
  qué capas se solapan (layouts de cartela / plantilla / código / v1-v2),
  qué código está muerto, qué endpoints existen y quién los usa.
- Lista de riesgos ordenada por "probabilidad de volver a hacer sufrir".

### F1 — Red de seguridad (lo primero que se construye)
- **Humo end-to-end** con Playwright contra el servidor arrancado en local:
  login → agenda exprés (guardar hoy y mañana) → editar cartela → convertir
  manual↔worker↔carrusel → guardar plantilla ★ y comprobar que aparece en el
  selector → publicar en dry-run con diff → takeover on/off → ajustes
  (guardar y releer). Cada flujo termina con una aserción visible.
- **Matriz visual**: `qa:templates:visual` generado ANTES y DESPUÉS de cada
  cambio de plantillas, con comparación de píxeles y umbral.
- `npm test` que encadena todo. Sin verde, no hay commit.

### F2 — Entrega sin dolor (mata el calvario de la caché para siempre)
- **Assets con huella**: `app.js`, `editor.js` y CSS servidos como
  `app.<hash>.js` (o query `?v=<hash>` generada en build) referenciados desde
  HTML no cacheable. La caché deja de ser un enemigo posible, no "mitigado".
- **Versión visible + aviso de actualización**: el panel muestra su versión;
  si el servidor tiene otra, banner "Actualizar" que recarga. En la PWA, el
  service worker gestiona la actualización con aviso, nunca en silencio.
- **Deploy verificado**: `update-server.sh` termina con healthcheck real
  (HTTP 200 en `/api/whoami` + versión esperada + humo mínimo) y sale con
  error claro si algo no cuadra. Documentar rollback en un comando.
- **Backup diario** de `data/` + `config/` (retención 14 días) y restauración
  probada una vez.

### F3 — Simplificación (después de tener la red, no antes)
- Unificar el sistema de capas de diseño en un modelo explicable en 3 frases,
  manteniendo compatibilidad con los datos existentes del usuario.
- Si el usuario bendice el diseño v2: retirar v1 y el conmutador, migrando
  limpiamente. Si no, dejar v2 por defecto documentado.
- Borrar código muerto, endpoints huérfanos y duplicaciones detectadas en F0.
- Revisar todos los textos del panel: cero jerga interna (materializar,
  slots, workers…) de cara al usuario.

### F4 — Pulido de los recorridos reales
- Cronometrar los 3 flujos matinales (agenda del día, retoque de estilo,
  publicar/verificar). Objetivo: < 60 s cada uno en móvil. Proponer y aplicar
  los recortes de fricción que salgan (con el usuario decidiendo).
- Auditoría iOS PWA completa: safe-areas, teclado sobre diálogos, foco,
  objetivos táctiles, modo horizontal.

### F5 — Sello 1.0
- CHANGELOG desde 0.100, manual de usuario (una página por flujo, con
  capturas), README técnico actualizado.
- Tag `v1.0.0`, backup completo, y una lista de "qué mirar si algo va mal"
  para el usuario (runbook de 10 líneas).

## Criterios de aceptación de la 1.0 (checklist medible)

- [ ] `npm test` (unit + humo e2e + matriz visual) en verde, < 10 min.
- [ ] Deploy → abrir el panel SIN limpiar caché muestra la versión nueva,
      siempre, en Safari iOS instalado como app.
- [ ] Un deploy roto se detecta solo (healthcheck) y se revierte en 1 comando.
- [ ] Crear plantilla ★ → aparece en el selector inmediatamente, en móvil.
- [ ] Publicación: nunca tanda parcial; rollback y máquina del tiempo probados.
- [ ] Los 3 flujos matinales < 60 s cada uno, medidos.
- [ ] `data/` con backup diario automático y restauración documentada.
- [ ] Cero referencias a jerga interna en la interfaz.
- [ ] Manual de usuario entregado y validado por el usuario.

## Primer mensaje que debes darme

Un plan de F0 con: qué vas a leer, qué entregarás como mapa/diagnóstico, y las
2-3 preguntas mínimas que necesitas de mí (si las hay). Nada de código todavía.
