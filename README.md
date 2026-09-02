# TRAZA5 WEB — Trazabilidad industrial multiempresa

Versión web de TRAZA5 construida con **Node.js + PostgreSQL**. No utiliza Python.

## Funciones incluidas

- Una única aplicación para administrar varias empresas clientes.
- Separación estricta por empresa de usuarios, sectores, proveedores, productos, recetas, lotes, elaboraciones y auditoría.
- Administración general con selector de empresa activa.
- Cada cliente puede tener la cantidad de sectores que necesite, con nombre, orden y estado editables.
- Usuarios con contraseña y roles `Administración general`, `Administrador de empresa` y `Operador`.
- Cada usuario cliente queda vinculado a una sola empresa y no puede acceder a datos de otra.
- Proveedores y productos maestros; el operador solo selecciona datos existentes.
- Cada producto puede vincularse con uno o varios proveedores de su empresa.
- En recepción, el proveedor se completa automáticamente cuando el producto tiene una sola opción y se filtra cuando tiene varias.
- Se permiten nombres de producto repetidos; el código y los proveedores permiten diferenciarlos.
- Ingreso diario de mercadería con proveedor, producto, marca, lote proveedor, cantidad, precio, fecha de ingreso y vencimiento.
- Lote interno automático para cada ingreso.
- Productos clasificados como materia prima, subproducto, producto intermedio, producto terminado, envase u otro.
- Recetas versionadas por sector.
- Recetas que pueden utilizar subproductos/productos intermedios fabricados en otros sectores.
- Elaboraciones con lote interno y lote final automáticos.
- Consumo de uno o varios lotes por ingrediente.
- Saldo disponible por lote: cantidad original - consumos.
- Control para impedir consumir más cantidad que la disponible.
- Lotes elaborados con estado `LIBERADO`, `BLOQUEADO` o `RECHAZADO`.
- Un lote bloqueado/rechazado no se ofrece como insumo.
- Trazabilidad hacia atrás: lote final → elaboraciones → subproductos → materias primas → proveedor / ingreso / vencimiento.
- Trazabilidad hacia adelante: materia prima o subproducto → todos los lotes que lo consumieron.
- Ejercicio de trazabilidad por producto + lote.
- Planillas de ingresos y elaboraciones filtrables por fecha y búsqueda, imprimibles o exportables a PDF desde el navegador.
- Informes completos de trazabilidad imprimibles o exportables a PDF después de reconstruir el lote.
- Auditoría de altas, accesos, cambios de contraseña y cambios de estado.
- Diseño adaptable a PC, tablet y celular.

## Requisitos para ponerlo online

1. Un servicio capaz de ejecutar Node.js 20 o superior (o Docker).
2. Una base de datos PostgreSQL.
3. Una URL HTTPS.
4. Variables de entorno:

```env
DATABASE_URL=postgresql://usuario:password@servidor:5432/base
SESSION_SECRET=un-secreto-largo-y-unico
ADMIN_USER=admin
ADMIN_INITIAL_PASSWORD=una-clave-inicial-segura
NODE_ENV=production
PORT=3000
```

En Railway, `PORT` se crea automáticamente. La aplicación escucha en
`0.0.0.0` y utiliza ese puerto sin que sea necesario editar el código.

### Configuración exacta en Railway

Las variables deben cargarse en el servicio **TRAZA5**, no solamente en el
servicio **Postgres**. En `TRAZA5 > Variables`, agregar:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
SESSION_SECRET=un-texto-largo-y-dificil-de-adivinar
ADMIN_USER=admin
ADMIN_INITIAL_PASSWORD=una-clave-inicial-segura
NODE_ENV=production
```

Si el servicio de base de datos tiene otro nombre, usar **Add Reference** y
seleccionar su `DATABASE_URL`. No crear `PORT` manualmente.

El proyecto incluye `railway.json` y la ruta `/health` para que Railway pueda
verificar automáticamente que tanto TRAZA5 como PostgreSQL están disponibles.

Al arrancar por primera vez, TRAZA5 crea automáticamente las tablas, una empresa inicial llamada
`Consultora en Alimentos`, cinco sectores editables y la cuenta de administración general.
Las instalaciones anteriores se migran automáticamente al modelo multiempresa.

## Inicio del servidor

```bash
npm install
npm start
```

El servidor mostrará:

```text
TRAZA5 activo en http://localhost:3000
```

## Prueba local con Docker

Si la computadora tiene Docker Desktop:

```bash
docker compose up --build
```

Luego abrir:

```text
http://localhost:3000
```

Usuario de prueba local: `admin` / `admin123`.

**Cambiar esa contraseña al primer ingreso.**

## Flujo recomendado de primera configuración

1. Ingresar como administración general.
2. Cambiar contraseña.
3. Crear una empresa cliente y definir su cantidad inicial de sectores.
4. Abrir esa empresa desde el selector superior.
5. Renombrar, agregar o desactivar sectores.
6. Cargar proveedores y productos de la empresa.
7. Cargar recetas y sus versiones.
8. Crear el administrador u operadores de ese cliente.
9. Registrar ingresos y elaboraciones.
10. Probar una trazabilidad completa hacia atrás y hacia adelante.

## Recomendaciones para uso industrial real

Antes de usar el sistema como registro crítico de producción, conviene validar con la planta: reglas de loteo, unidades, tolerancias de receta, reprocesos, mermas, devoluciones, liberación de Calidad, criterios de retiro/recall, períodos de retención de datos y requisitos regulatorios aplicables. También conviene configurar backups automáticos de PostgreSQL y monitoreo del servidor.

### Siguiente evolución sugerida

- QR / código de barras para recepción, producción y despacho.
- Permisos por sector.
- Aprobación de Calidad antes de liberar lotes.
- Mermas y rendimientos teóricos vs. reales.
- Reprocesos con vínculo formal.
- Despachos/clientes para trazabilidad hasta destino comercial.
- Modo recall/retiro con listado de lotes y clientes afectados.
- Alertas de vencimiento y stock FEFO.
- Exportación Excel para análisis complementarios.
- Adjuntos (certificados, análisis, remitos, fotos).
- Firma electrónica o doble aprobación para operaciones sensibles.
