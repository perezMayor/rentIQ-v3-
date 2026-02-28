# Operativa por módulo (nivel acción)

Describe entradas, validaciones y efectos de acciones activas en la versión actual.

## Convenciones
- `LECTOR`: solo lectura en acciones de escritura.
- Sin sesión en panel/acciones server: redirect a `/login`.
- Error de negocio/técnico en acciones server: redirect con `?error=...`.
- Persistencia base: `rental-store.json`.
- Auditoría: `audit-log.jsonl`.

## Dashboard (`/dashboard`)
- Evento manual de auditoría:
  - invoca `POST /api/audit`.
  - registra evento `SYSTEM` con entidad `dashboard`.

## Reservas (`/reservas`)
- `createReservation`:
  - crea reserva, calcula/prepara importes y total.
  - genera numeración `RSV-{AAAA}-{000000}`.
- `updateReservation`:
  - actualiza campos editables de la reserva.
- `deleteReservation`:
  - borra reserva si no tiene contrato asociado.
- `convertReservationToContract`:
  - crea contrato `ABIERTO` y vincula `reservation.contractId`.
- `sendReservationConfirmation`:
  - genera confirmación con plantilla y registra log de envío.
- `addSalesChannel`:
  - alta de canal de venta en configuración.
- `listReservationAudit`:
  - trazabilidad por reserva/contrato relacionado.

## Contratos (`/contratos`)
- `registerContractCheckOut`:
  - guarda datos de entrega (km, combustible, notas, fotos).
- `registerContractCheckIn`:
  - guarda datos de devolución (km, combustible, notas, fotos).
- `changeContractVehicle`:
  - cambia matrícula del contrato con validaciones de coherencia.
- `registerContractCash`:
  - registra caja del contrato.
- `addInternalExpense`:
  - registra gasto interno vinculado a contrato.
- `updateContract`:
  - edición de datos de contrato.
- `deleteContract`:
  - borrado de contrato según reglas de integridad del servicio.
- `closeContract`:
  - requiere caja registrada.
  - cierra contrato y genera factura.

## Planning (`/planning`)
- `assignPlateToReservation`:
  - asigna matrícula a reserva.
  - valida conflictos de solape.
  - soporta override de solape y override de grupo.
  - soporta ajuste opcional de precio por cambio de grupo.
- `createVehicleBlock`:
  - crea bloqueo por matrícula en intervalo.
  - exige override si hay conflicto de solape.

## Entregas (`/entregas`) y Recogidas (`/recogidas`)
- `listDeliveries` / `listPickups`:
  - consulta por rango y sucursal.
- Exportación:
  - entregas: `/api/reporting/entregas/export`
  - recogidas: `/api/reporting/recogidas/export`
- `deleteReservation` desde tabla:
  - permitido solo en reservas sin contrato.

## Vehículos (`/vehiculos`)
- Categorías/grupos:
  - `createVehicleCategory`, `updateVehicleCategory`, `deleteVehicleCategory`.
- Modelos:
  - `createVehicleModel`, `updateVehicleModel`, `deleteVehicleModel`.
- Flota:
  - `createFleetVehicle`, `updateFleetVehicle`, `registerFleetVehicleDrop`, `deleteFleetVehicle`.
- Extras:
  - `createVehicleExtra`, `updateVehicleExtra`, `deleteVehicleExtra`.
- Consultas de apoyo:
  - `getReservationForecast`, `getVehicleProductionSummary`, listados operativos derivados.

## Clientes (`/clientes`)
- `createClient`:
  - alta por tipo (`PARTICULAR`, `EMPRESA`, `COMISIONISTA`).
  - valida obligatorios por tipo y controla duplicados.
- `updateClient`:
  - edición de datos de cliente.
- `deactivateClient`:
  - baja lógica de cuenta.
- `deleteClient`:
  - borrado de cliente según validaciones del servicio.
- `listClientReservations`:
  - histórico por cliente.
- `deleteReservation` desde histórico:
  - elimina reserva seleccionada (si reglas lo permiten).

## Gastos (`/gastos`)
- `createDailyOperationalExpense`:
  - registra gasto diario y reparte por matrículas informadas.
  - valida matrículas con alquiler activo en la fecha.
- `updateInternalExpense`:
  - edición de gasto interno.
- `deleteInternalExpense`:
  - borrado de gasto interno.
- `listDailyOperationalExpenses`:
  - histórico filtrable por rango/matrícula/empleado.
- `validateDailyOperationalExpenses`:
  - chequeos de consistencia (batch, empleado, flota, alquiler activo).

## Facturación (`/facturacion`)
- `renameInvoice`:
  - renombra factura.
- `changeInvoiceDate`:
  - cambia fecha de emisión.
- `sendInvoiceUsingTemplate`:
  - genera documento, envía mail y registra log `ENVIADA/ERROR`.
- `deleteInvoice`:
  - borra factura según validaciones de servicio.
- Consultas auxiliares:
  - `listInvoiceSendLogs`
  - `listExpenseJournal`
  - `listContractClosureReconciliation`.
- Descarga PDF:
  - `/api/facturas/[invoiceId]/download`
  - `/api/facturas/[invoiceId]/pdf`.

## Plantillas (`/plantillas`)
- `createTemplate`:
  - alta de plantilla por código/tipo/idioma.
- `updateTemplate`:
  - edición de título, idioma, estado activo y HTML.
- `deleteTemplate`:
  - borrado de plantilla.

## Tarifas (`/tarifas`)
- `createTariffPlan`, `updateTariffPlan`, `deleteTariffPlan`.
- `upsertTariffBracket`, `deleteTariffBracket`.
- `upsertTariffPrice` (matriz grupo x tramo).
- `LECTOR`:
  - denegación de acceso + auditoría `RBAC_DENIED`.

## Gestor (`/gestor`)
- `updateCompanySettings`:
  - configuración fiscal, series, sucursales, retención y datos de empresa.
- `verifySmtpConnection`:
  - prueba técnica SMTP (con envío opcional).
- `createFullBackup("FORCED")`:
  - backup manual (solo `SUPER_ADMIN`).
- `restoreBackup`:
  - restauración con doble confirmación (solo `SUPER_ADMIN`).
- `listBackups`:
  - histórico de backups con búsqueda y paginado.

## Configuración (`/configuracion`)
- Placeholder sin acciones de negocio activas.
