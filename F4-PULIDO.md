# F4 — Pulido de los recorridos reales (v0.152.0)

> F4 deja de añadir opciones y recorta el trabajo diario. El criterio es que
> preparar no obligue a entender la arquitectura interna del sistema.

## Recorridos simplificados

### Agenda del día

- Entrada directa desde la portada, con texto libre y sugerencias de Kulturklik.
- Las exposiciones se guardan como `EXPO`, sin inventar una hora.
- En pantalla sale un evento por escena, con tipografía grande y alineación
  estricta para el panel LED.
- Prueba: `qa:agenda` y el humo de Agenda de hoy/mañana.

### Preparar la próxima tanda

- El asistente parte siempre de las ocho posiciones actuales: no borra el
  trabajo previo ni obliga a reconstruirlo.
- Se puede cambiar cualquier posición, volver atrás y cerrar; el borrador se
  recupera al abrir de nuevo.
- Los carruseles enseñan la pieza actual y la siguiente. Las fuentes
  automáticas muestran origen, última comprobación y permiten comprobarlas.
- La rotación se elige con controles visibles; ya no se escribe contenido en
  formatos crípticos separados por barras.
- Prueba: humo «próxima tanda» y «estado de fuentes».

### Publicar y verificar

- La portada separa `Preparar archivos`, `Vista previa` y `Subir`.
- El resultado distingue de forma visible una comprobación sin envío de un
  envío real y conserva el último envío confirmado.
- La tanda sigue siendo atómica: exactamente ocho MP4 o no se toca la pantalla.
- El tiempo activo de la persona es inferior a un minuto; generar ocho vídeos
  nuevos puede tardar más, pero es espera de máquina y el panel muestra el
  progreso. Los archivos sin cambios se reutilizan.

## Auditoría iPhone/PWA

- Safe areas en cabecera, laterales y borde inferior.
- Botones táctiles de al menos 44 px y foco visible.
- Los diálogos usan la altura visual real cuando aparece el teclado; cabecera y
  botones quedan fijos y solo se desplaza el cuerpo.
- El editor visual ya no intenta encajar una columna fija de 330 px junto al
  lienzo en un iPhone de 390 px: en vertical se apilan lienzo y controles; en
  horizontal vuelven a colocarse lado a lado con cabecera compacta.
- `tests/e2e/ios.spec.js` blinda Agenda vertical, asistente horizontal y editor
  en ambas orientaciones.

## Medición honesta pendiente

La geometría y los recorridos están automatizados, pero el criterio humano de
60 segundos debe cerrarse con una última medición en el iPhone real después
del despliegue de esta versión. No se confunde el tiempo de decisión o de
generación de vídeo con el tiempo de interacción.
