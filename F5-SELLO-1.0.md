# F5 — Sello 1.0

## Ya preparado

- `CHANGELOG.md` resume las entregas desde 0.100.
- `README.md` describe el sistema real, sus garantías y operación actual.
- `docs/manual/` contiene una página por recorrido y capturas reproducibles.
- `docs/RUNBOOK.md` da diez pasos concretos ante una incidencia.
- `npm run manual:capturas` regenera las imágenes sin tocar datos ni FTP.
- La candidata fue `0.153.0`; la versión sellada es `1.0.0`. `npm test`
  incluye la comprobación previa 6/8, la carrera cierre/render y la matriz
  visual.
- Cierre funcional aprobado el 18-07-2026: la candidata queda congelada. Las
  mejoras no bloqueantes (por ejemplo, iconos SVG animados) pasan a la serie
  posterior a 1.0.
- Batería final ejecutada el 18-07-2026: 18/18 recorridos E2E, 16/16 estilos y
  comparación visual con 0,000 % de diferencia.

## Puertas antes del tag

- [x] Comprobar en el iPhone real la PWA y los recorridos operativos.
- [x] Confirmar que Safari/PWA muestra `0.153.0` tras desplegar sin limpiar caché.
- [x] Validar el manual con la persona que opera la pantalla.
- [x] Ejecutar y comprobar un backup final de producción
  (`pantalla-datos-2026-07-18.tgz`, 166,2 MB).
- [x] Desplegar la candidata con healthcheck verde (`0.153.0`, puerto 3037).
- [x] Crear el tag `v1.0.0` únicamente después de esas comprobaciones.

## Checklist de aceptación

- [x] `npm test` verde y por debajo de 10 minutos.
- [x] Deploy → PWA muestra siempre la versión nueva sin limpiar caché.
- [x] Deploy roto detectable y rollback documentado en un comando.
- [x] Plantilla ★ aparece en el selector inmediatamente.
- [x] Publicación atómica de ocho MP4 protegida.
- [x] Probar en producción la vuelta a tanda anterior, restaurar la emisión
  archivada y verificar los ocho archivos por FTP.
- [x] Backup diario con retención y restauración probada.
- [x] Interfaz protegida contra la jerga interna conocida.
- [x] Manual validado por el usuario.

## Seguimiento posterior a 1.0

- [ ] Medir tres recorridos matinales reales; objetivo: menos de 60 segundos de
  interacción humana, sin contar la espera de generación o subida.
