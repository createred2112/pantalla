# Si algo va mal — 10 pasos

1. No repitas **Subir** varias veces: espera a que termine la operación visible.
2. Abre **Estado** y lee el último resultado; distingue comprobación de envío real.
3. Si faltan archivos, toca **Preparar archivos** y espera a que marque 8/8.
4. Revisa la vuelta con **Vista previa** antes de intentar otro envío.
5. Si una fuente automática falla, toca **Comprobar ahora**; se conserva el dato anterior.
6. Si el panel ofrece **Actualizar**, tócala; no hace falta borrar caché ni reinstalar la PWA.
7. Si la nueva tanda es incorrecta, usa **Volver a la tanda anterior**.
8. Si el panel no responde, en el VPS ejecuta `bash scripts/update-server.sh --healthcheck`.
9. Si el último despliegue rompió el panel, ejecuta `bash scripts/update-server.sh --rollback`.
10. Si se dañaron datos, no edites archivos: restaura el último backup con `npm run backup:restore -- backups/ARCHIVO.tgz`.
