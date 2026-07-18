# F5 — Sello 1.0

## Ya preparado

- `CHANGELOG.md` resume las entregas desde 0.100.
- `README.md` describe el sistema real, sus garantías y operación actual.
- `docs/manual/` contiene una página por recorrido y capturas reproducibles.
- `docs/RUNBOOK.md` da diez pasos concretos ante una incidencia.
- `npm run manual:capturas` regenera las imágenes sin tocar datos ni FTP.
- La candidata es `0.152.0`; `npm test` incluye la carrera cierre/render y la
  matriz visual tiene 0,000 % de diferencia.

## Puertas antes del tag

- [ ] Medir en el iPhone real: Agenda, retoque de estilo y publicar/verificar.
- [ ] Confirmar que Safari/PWA muestra `0.152.0` tras desplegar sin limpiar caché.
- [ ] Validar el manual con la persona que opera la pantalla.
- [ ] Ejecutar y comprobar un backup final de producción.
- [ ] Desplegar la candidata con healthcheck verde.
- [ ] Crear el tag `v1.0.0` únicamente después de esas comprobaciones.

## Checklist de aceptación

- [x] `npm test` verde y por debajo de 10 minutos.
- [ ] Deploy → PWA muestra siempre la versión nueva sin limpiar caché.
- [x] Deploy roto detectable y rollback documentado en un comando.
- [x] Plantilla ★ aparece en el selector inmediatamente.
- [x] Publicación atómica de ocho MP4 protegida.
- [ ] Probar en la candidata la vuelta a tanda anterior y una restauración del histórico.
- [ ] Tres recorridos matinales medidos en menos de 60 s de interacción.
- [x] Backup diario con retención y restauración probada.
- [x] Interfaz protegida contra la jerga interna conocida.
- [ ] Manual validado por el usuario.
