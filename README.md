# TRAZA5 WEB — Trazabilidad industrial multiusuario

Versión web de TRAZA5 construida con **Node.js + PostgreSQL**. No utiliza Python.

## Funciones incluidas

- 5 sectores iniciales, con nombre y orden editables por el administrador.
- Usuarios con contraseña y roles `Administrador` / `Operador`.
- Solo el administrador accede a usuarios, sectores, proveedores, productos, recetas y auditoría.
- Proveedores y productos maestros; el operador solo selecciona datos existentes.
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
- Planillas filtrables e imprimibles / guardables como PDF desde el navegador.
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

Al arrancar por primera vez, TRAZA5 crea automáticamente las tablas, los 5 sectores y el administrador inicial.

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

1. Ingresar como administrador.
2. Cambiar contraseña.
3. Renombrar los 5 sectores.
4. Cargar proveedores.
5. Cargar materias primas, subproductos, intermedios y terminados.
6. Cargar recetas y sus versiones.
7. Crear operadores.
8. Registrar ingresos de mercadería.
9. Registrar elaboraciones seleccionando lotes disponibles.
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
- Exportación Excel y PDF con formato corporativo.
- Adjuntos (certificados, análisis, remitos, fotos).
- Firma electrónica o doble aprobación para operaciones sensibles.
