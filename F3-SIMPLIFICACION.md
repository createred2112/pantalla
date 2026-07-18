# F3 — Simplificación y correcciones de estabilidad (v0.151.0)

> El diseño GIGANTE queda como único diseño del producto. Los datos antiguos
> se conservan, pero ya no existe un conmutador capaz de devolver el panel a
> una vía de render distinta.

## El modelo de diseño, en tres frases

1. Si una cartela tiene un diseño propio creado con v2, se usa ese diseño.
2. Si no, se usa su plantilla propia ★ o el diseño predeterminado de su
   plantilla y color.
3. Si tampoco existe, se usa la plantilla GIGANTE incluida en el código; el
   tema aporta los colores y los datos de la cartela aportan el contenido.

## Qué se ha simplificado

- Retirados el selector v1/v2 del panel, los comandos `design:*` y la vía de
  ejecución v1. Los módulos clásicos que aún sirven de base interna no son una
  versión seleccionable.
- Un solo archivo de diseños predeterminados vivo:
  `data/template-layouts.v2.json`. `data/template-layouts.json` y los diseños
  antiguos se conservan en disco como histórico, pero no se leen ni migran.
- La auditoría y la matriz visual revisan únicamente el diseño definitivo.
- Retirados `src/webdrafts.js`, la ruta inexistente `/app.css` y los endpoints
  sin consumidor `PUT /api/rundown/day/:date`, `GET /api/workers` y
  `GET /api/audit`.
- Eliminadas ramas muertas v1 en las reparaciones de clima, previsión y calidad
  del aire.
- Textos visibles traducidos a lenguaje de uso: “dato automático”, “alerta en
  exclusiva”, “MP4 listo”, “volver a la tanda anterior” y “comprobación sin
  envío”. Un chequeo impide que regresen las expresiones internas conocidas.

## Fallo miniatura correcta / MP4 incorrecto

El titular se ajusta dos veces: al cargar el HTML y después de cargar la fuente
definitiva. Si la primera medición, hecha todavía con una fuente provisional,
marcaba desborde, la segunda medición no limpiaba esa marca. La miniatura se
veía bien porque quedaba recortada en varias líneas, pero el vídeo interpretaba
la marca vieja como una orden de convertir el texto en marquesina horizontal.

El autoajuste ahora es reejecutable: antes de medir limpia tanto la marca de
desborde como el recorte anterior. `qa:autofit` reproduce el titular real largo,
envenena el estado como lo hacía la primera medición y exige varias líneas sin
marca de marquesina. La misma prueba ejecutada contra el código anterior deja
`overflow=1` y falla.

## Otras defensas encontradas al verificar

- La alerta exclusiva reintenta su publicación si la emisión está ocupada, en
  vez de perder silenciosamente la entrada o la restauración.
- Un candado dejado por un proceso muerto se libera inmediatamente; un proceso
  vivo sigue protegido. También se limpia al arrancar el servidor.
- El modo Playwright no inicia piloto, avisos, limpieza ni otras tareas de
  fondo, y `ftpConfig()` devuelve credenciales vacías por contrato. Esto cierra
  la ventana entre el arranque del servidor de prueba y el snapshot de datos.
- La Agenda exprés ignora respuestas antiguas de Hoy/Mañana y nunca reemplaza
  texto que el operador haya empezado a escribir. Así una carga atrasada no
  puede reabrir el diálogo tras guardar ni borrar una edición en curso.

## Verificación local

Entorno: Windows, Node 22.18.0, Chrome de Playwright/Puppeteer, FTP anulado.

- orden de escaleta: OK;
- backup → desastre → restauración y retención: OK;
- candados huérfanos y reintento de alerta exclusiva: OK;
- 16 plantillas = 16 estilos únicos, sin paletas ni combinatoria cromática: OK;
- titular largo / autoajuste: OK, 4 líneas y sin desborde fantasma;
- interfaz sin jerga interna conocida: OK;
- humo Playwright: 13/13;
- referencia visual: 1 hoja con las 16 plantillas, 0,000% de diferencia
  (umbral 0,1%).

La verificación usa los datos locales protegidos por snapshot. El titular del
fallo y la copia del VPS se inspeccionaron en `vps-data/`; las pruebas no se
conectan al FTP de producción.
