# Módulos, rutas y permisos

## Rutas de navegación
Definidas en `src/lib/navigation.ts`.

Comunes (`SUPER_ADMIN`, `ADMIN`, `LECTOR`):
- `/dashboard`
- `/reservas`
- `/contratos`
- `/planning`
- `/entregas`
- `/recogidas`
- `/vehiculos`
- `/clientes`
- `/gastos`
- `/facturacion`
- `/plantillas`

Solo `SUPER_ADMIN` y `ADMIN`:
- `/tarifas`
- `/gestor`

Ruta adicional en sidebar (placeholder):
- `/configuracion` (sin lógica de negocio activa)

## Comportamiento por módulo

- `Dashboard`:
  - vista base del panel.
  - botón de evento manual de auditoría.

- `Reservas`:
  - alta/edición/borrado de reservas.
  - conversión de reserva a contrato.
  - envío y descarga de confirmación.
  - forecast por rango.
  - estadísticas y alta de canal de venta.
  - trazabilidad de auditoría por reserva.
  - `LECTOR`: sin escritura.

- `Contratos`:
  - listado y búsqueda.
  - checkout / checkin.
  - cambio de vehículo.
  - registro de caja.
  - gasto interno vinculado.
  - cierre de contrato (genera factura).
  - edición y borrado de contrato.
  - descarga de preimpresión.
  - `LECTOR`: sin escritura.

- `Planning`:
  - vista por periodo (`30/60/90`) y filtros (`matrícula`, `grupo`, `modelo`).
  - asignación manual de matrícula.
  - bloqueo manual de vehículo.
  - override explícito para conflictos y para cambio de grupo.
  - opción de ajuste de precio por override de grupo.
  - `LECTOR`: sin escritura.

- `Entregas`:
  - listado por rango/sucursal.
  - exportación PDF.
  - borrado de reserva solo si no hay contrato.

- `Recogidas`:
  - listado por rango/sucursal.
  - exportación PDF.
  - borrado de reserva solo si no hay contrato.

- `Vehículos`:
  - pestañas: grupos, modelos, altas/bajas, listados, producción, extras.
  - CRUD de categorías, modelos, flota y extras.
  - baja operativa de flota.
  - listados de inactivos/activos sin actividad.
  - resumen de producción por rango.
  - `LECTOR`: sin escritura.

- `Clientes`:
  - alta por tipo (`PARTICULAR`, `EMPRESA`, `COMISIONISTA`).
  - edición, baja lógica y borrado.
  - histórico de reservas por cliente.
  - borrado de reserva desde histórico.
  - `LECTOR`: sin escritura.

- `Gastos`:
  - registro de gasto diario operativo (batch distribuido por matrículas).
  - validación operativa por rango.
  - histórico con filtros por fecha/matrícula/empleado.
  - edición y borrado de gastos internos.
  - exportación CSV desde API de reporting.
  - `LECTOR`: sin escritura.

- `Facturación`:
  - listado/búsqueda de facturas.
  - renombrado y cambio de fecha.
  - envío email con plantilla + PDF adjunto.
  - borrado de factura.
  - descarga/visualización PDF.
  - diario contable (gastos internos) y conciliación de cierres.
  - logs de envío.
  - `LECTOR`: solo lectura.

- `Plantillas`:
  - alta, edición, activación/desactivación y borrado.
  - tipos: `CONTRATO`, `CONFIRMACION_RESERVA`, `FACTURA`.
  - preview HTML.
  - `LECTOR`: sin escritura.

- `Tarifas`:
  - módulo operativo (no placeholder).
  - alta/edición/borrado de plan.
  - mantenimiento de tramos.
  - matriz de precios por grupo/tramo.
  - `LECTOR`:
    - acceso denegado
    - auditoría `RBAC_DENIED`
    - redirect a `/dashboard`.

- `Gestor`:
  - configuración fiscal/empresa.
  - series de numeración y sucursales.
  - prueba SMTP.
  - backups (listado/filtro/paginado).
  - backup forzado (`SUPER_ADMIN`).
  - restore con doble confirmación (`SUPER_ADMIN`).

- `Configuración`:
  - pantalla placeholder (`pendiente`).

## Reglas técnicas visibles
- No se cierra contrato sin caja registrada.
- Cierre de contrato genera factura y vincula `contract.invoiceId`.
- En entregas/recogidas no se borra reserva con contrato.
- Asignación de matrícula detecta solapes y exige override cuando aplica.
- Alta de gasto diario valida matrículas activas para la fecha.
