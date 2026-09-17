# Traza 5 · Gestión integrada

Versión con recetas, documentos PDF, informes seleccionables, ventas y trazabilidad por consumos reales de lotes.

## Ejecutar

Node.js 24 o posterior. No requiere instalar dependencias para ejecutar el servidor.

`node iniciar.mjs` inicia la versión local. `node --test tests/*.test.mjs` ejecuta las pruebas.

## Railway

Usar esta carpeta como directorio raíz, con su Dockerfile. Adjuntar un volumen persistente en `/data`, mantener una sola réplica y configurar el dominio HTTPS. El inicio online exige el volumen en Railway para evitar perder datos al desplegar.

Variables: `PUBLIC_ORIGIN` (URL HTTPS sin barra final), `ADMIN_USER` y `ADMIN_INITIAL_PASSWORD` (mínimo 12 caracteres para la primera instalación). Railway proporciona `PORT` y `RAILWAY_VOLUME_MOUNT_PATH`. Las credenciales se configuran en el alojamiento; no se guardan en GitHub.

El administrador se crea sólo si la base todavía no tiene uno. Los reinicios no reemplazan usuarios ni datos. La aplicación anterior usa PostgreSQL; esta versión usa SQLite en el volumen. Conservar el servicio anterior hasta completar la importación y verificar sus datos.

Los datos de empresas, lotes, ventas, credenciales y PDF privados no forman parte de este repositorio. Descargar las copias de cada empresa desde el programa y mantener también copias del volumen fuera del servicio antes de cambios importantes.

## Respaldos completos

Panel admin de respaldos cifrados y restauración por fecha, copia previa y conexión opcional a Google Drive. Ver RESPALDOS.md dentro del paquete. El envío diario requiere completar la autorización de Google y configurar las variables privadas; desplegar el código no lo activa por sí solo.
