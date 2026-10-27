# Juni y cargas de listas · Traza-Actual

La cuenta `juni` tiene rol `admin`, sin empresa asignada: puede elegir cualquiera de las empresas mediante Editar. Se prepara desactivada, con un marcador que no sirve para autenticar. No se genera ninguna contraseña.

## Activación privada

1. El administrador principal entra en Traza-Actual.
2. En Administradores globales, selecciona **Activar con contraseña privada** junto a Juni y define personalmente una contraseña de al menos 12 caracteres.
3. En el navegador privado que se utilizará para trabajar, entra como `juni` y marca **Recordar a Juni**. No comparte la contraseña por chat ni la guarda en el repositorio.

La sesión recordada no vence por tiempo en el servidor. El navegador tiene que conservar su cookie. Cerrar sesión, bloquear/desactivar la cuenta o cambiar/restablecer su contraseña invalida el acceso; bloquear o restablecer revoca todas sus sesiones. Otros usuarios conservan sus ocho horas habituales. El panel no permite bloquear la propia cuenta ni dejar el sistema sin un administrador activo.

## Cargas

Solo Juni puede utilizar **Cargar archivo**, después de elegir **Editar** en la empresa destino. El nombre de la empresa se muestra en la vista previa. Para cambiarla hay que cancelar y elegir otra empresa.

Se admiten PDF con texto (hasta 50 páginas), TXT con un nombre por línea, CSV/TSV con columnas `nombre` y `unidad`, o JSON con una lista de nombres u objetos `name` y `unit`. Máximo 4 MB y 500 filas. La primera versión importa clientes, proveedores, materias primas y productos terminados como registros nominales. No importa existencias, lotes, cantidades, fechas, precios, códigos, recetas, contactos ni vínculos con proveedores.

Los PDF se extraen localmente en el navegador con Mozilla PDF.js, sin servicios externos pagos. Cada línea requiere revisión; encabezados, columnas y tablas ambiguas deben corregirse o quitarse. Los PDF escaneados requieren transcripción. Para artículos se exige elegir una unidad; no se deduce por el nombre.

Extraer y validar nunca guarda datos empresariales. La vista previa es editable y muestra errores, duplicados y filas pendientes de revisión. Hay que validar los cambios y marcar explícitamente la confirmación para aplicar. Cancelar no guarda registros.

El servidor vuelve a validar empresa, versión y filas. Compara nombres sin distinguir acentos, mayúsculas, espacios repetidos y variantes de guion. Omite duplicados, incluidos archivados, sin alterar registros anteriores. Un nombre de artículo existente con otro tipo se rechaza para revisión. La escritura y sus auditorías de cambios se confirman en una sola transacción; cualquier error revierte ambas.

No se conserva el archivo original. Se guarda su SHA-256 junto con el tipo, conteos, identificador común de la carga y una auditoría por registro creado, bajo la identidad de Juni. Las solicitudes de Juni también se registran sin cuerpos, contraseñas, cookies ni tokens. El historial de cada empresa muestra la cuenta; el historial global permite revisar accesos y operaciones de todas las empresas.

El stock queda fuera de esta primera versión. La extensión deberá exigir artículo existente, unidad, cantidad, fecha y lote, reutilizar las validaciones de movimientos y conservar el mismo esquema de vista previa y transacción.

## Despliegue

Solo Traza-Actual, servicio `bf632963-3316-403a-8590-b4b73d4dba9c`, entorno `45af37fc-6b19-4c60-95eb-22f91a9eb0a4`, volumen `/data/gestion.sqlite`. La preparación comprueba que los datos de todas las empresas se conservan exactamente. Los reinicios no cambian el estado de activación de Juni. No se cambia `main` ni TRAZA5.
