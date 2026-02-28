# API HTTP

## Convenciones generales
- Base local por defecto: `http://localhost:3203`.
- Endpoints protegidos dependen de cookie `rq_v3_session`.
- Errores API JSON: `{ "error": "..." }`.

## Autenticación

### `POST /api/login`
- Entrada: `form-data` con `role` (`SUPER_ADMIN` | `ADMIN` | `LECTOR`).
- Efecto:
  - crea cookie de sesión `rq_v3_session`.
  - registra `AUTH_LOGIN` en auditoría.
- Respuesta: redirect `303` a `/dashboard`.

### `POST /api/logout`
- Efecto:
  - invalida cookie de sesión.
  - si había sesión, registra `AUTH_LOGOUT`.
- Respuesta: redirect `303` a `/login`.

### `GET /api/logout`
- Alias funcional de logout (`POST`).

## Auditoría

### `POST /api/audit`
- Entrada JSON:
  - `action`
  - `actorId`
  - `actorRole`
  - `entity`
  - `entityId`
  - `details` (opcional)
- Efecto: append en `audit-log.jsonl`.
- Respuesta: `{ "ok": true }`.

### `GET /api/audit-log`
- Devuelve últimos eventos visibles.
- Respuesta: `{ "items": AuditEvent[] }`.

### `DELETE /api/audit-log`
- Requiere sesión `SUPER_ADMIN`.
- Entrada JSON:
  - `eventId` (obligatorio)
  - `reason` (opcional)
- Efecto: supresión lógica vía evento `AUDIT_SUPPRESS`.
- Respuesta: `{ "ok": true }`.

## Contratos y reservas (documentos)

### `GET /api/contratos/preimpresion`
- Requiere sesión.
- Query:
  - `language` (opcional, default `es`).
- Respuesta: HTML descargable (`contrato-en-blanco.html`).

### `GET /api/reservas/[reservationId]/confirmacion/download`
- Requiere sesión.
- Respuesta: HTML descargable de confirmación.

## Facturas

### `GET /api/facturas/[invoiceId]/download`
- Requiere sesión.
- Genera PDF de factura.
- Respuesta: PDF adjunto.

### `GET /api/facturas/[invoiceId]/pdf`
- Requiere sesión.
- Mismo comportamiento funcional que `download`.
- Respuesta: PDF adjunto.

## Reporting

### `GET /api/reporting/entregas/export`
- Requiere sesión.
- Query:
  - `from` (YYYY-MM-DD, opcional)
  - `to` (YYYY-MM-DD, opcional)
  - `branch` (opcional)
- Respuesta: PDF descargable.

### `GET /api/reporting/recogidas/export`
- Requiere sesión.
- Query igual que entregas.
- Respuesta: PDF descargable.

### `GET /api/reporting/gastos/export`
- Requiere sesión.
- Query:
  - `from` (YYYY-MM-DD, opcional)
  - `to` (YYYY-MM-DD, opcional)
  - `plate` (opcional)
  - `worker` (opcional)
- Respuesta: CSV con columnas:
  - `fecha,matricula,categoria,importe,empleado,batch,nota`

### `GET /api/reporting/productividad/export`
- Requiere sesión.
- Query:
  - `from` (YYYY-MM-DD, opcional)
  - `to` (YYYY-MM-DD, opcional)
- Respuesta: CSV con columnas:
  - `matricula,ingresos,gastos,coste_base,rentabilidad`

### `GET /api/reporting/facturas/export`
- Requiere sesión.
- Query:
  - `from` (YYYY-MM-DD, opcional)
  - `to` (YYYY-MM-DD, opcional)
  - `q` (opcional)
- Respuesta: CSV con columnas:
  - `numero,nombre,contrato_id,fecha,base,extras,seguros,penalizaciones,iva_pct,iva,total`

### `GET /api/reporting/facturas/conciliacion/export`
- Requiere sesión.
- Query:
  - `from` (YYYY-MM-DD, opcional)
  - `to` (YYYY-MM-DD, opcional)
- Respuesta: CSV con columnas:
  - `contrato_numero,fecha_cierre,caja_importe,caja_metodo,factura_numero,factura_total`

## Backups programados

### `POST /api/backups/scheduled`
- Autenticación obligatoria:
  - `Authorization: Bearer <BACKUP_SCHEDULE_TOKEN>`
- Query opcional:
  - `force=true` para saltar ventana horaria.
- Ventana normal de ejecución:
  - entre `03:00` y `03:09` en `Europe/Madrid`.

Respuestas:
- `401` si token ausente/incorrecto.
- `200` con `skipped: true` si fuera de ventana y sin `force`.
- `200` con resultado de backup si ejecuta:
  - `backupId`, `status`, `createdAt`, `durationMs`, `totalSizeBytes`, `checksum`, `failureReason`.
