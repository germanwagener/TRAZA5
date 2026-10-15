# TRAZA5 · Administración de empresas

Cada empresa tiene Editar, Restablecer, Bloquear y Eliminar. Editar abre sus pantallas con la cuenta administradora y ofrece Corregir datos para artículos, recetas, stock, movimientos, documentos y configuración. Las correcciones conservan los identificadores internos y se registran con antes/después y motivo; los saldos afectados por cambios de cantidades se actualizan en la misma operación.

Eliminar retira la empresa y todos sus usuarios de los accesos activos, cierra sus sesiones y guarda sus datos para Recuperar desde Empresas eliminadas. Los respaldos incluyen esas empresas. Las cuentas de empresa no pueden usar las correcciones administrativas ni consultar otras empresas.

El volumen y las credenciales del alojamiento se conservan. La imagen usa traza5-admin-edicion.tar.gz y Node.js 24.

## Versión 3.2 · Presentaciones y producción dividida

- Cada materia prima puede indicar su presentación habitual y el contenido real que aporta al stock.
- Los ingresos aceptan presentaciones o unidades compatibles y convierten automáticamente la cantidad disponible para producción.
- Las planillas incluyen buscadores rápidos.
- Una receta puede generar dos productos relacionados. Los componentes comunes se reparten proporcionalmente y los exclusivos se asignan al producto correspondiente.
- Cada salida recibe su propio lote y conserva la trazabilidad exacta de los insumos consumidos.
- La impresión, el PDF, los filtros por fecha y el aislamiento total entre empresas se mantienen.
