# Arquitectura técnica

## Stack
- Framework: Next.js `16.1.6` (App Router).
- Runtime: Node.js.
- UI: React `19.2.3`.
- Tipado: TypeScript.
- PDF: `pdfkit`.
- Email: `nodemailer`.

## Estructura principal
- UI y rutas: `src/app`.
- Panel operativo: `src/app/(panel)`.
- API routes: `src/app/api`.
- Dominio y tipos: `src/lib/domain/rental.ts`.
- Servicios de negocio: `src/lib/services`.
- Autenticación/sesión: `src/lib/auth.ts`.
- Auditoría: `src/lib/audit.ts`.
- Correo SMTP: `src/lib/mail.ts`.

## Control de acceso
- Cookie de sesión: `rq_v3_session`.
- Roles definidos:
  - `SUPER_ADMIN`
  - `ADMIN`
  - `LECTOR`
- Login demo por rol (sin password) en `POST /api/login`.
- Protección de panel en `src/app/(panel)/layout.tsx`:
  - Sin sesión -> redirect a `/login`.
- Restricciones por rol en páginas/acciones server:
  - Escritura denegada para `LECTOR` en módulos operativos.
  - `/tarifas` y `/gestor` fuera de alcance para `LECTOR`.
- No existe `middleware.ts` activo en esta versión.

## Persistencia
No hay base de datos externa; persistencia en filesystem local.

Directorio de datos:
- `RENTIQ_DATA_DIR` si está definido.
- Si no, `./.rentiq-v3-data`.

Estructuras persistidas:
- `rental-store.json`: datos operativos (reservas, contratos, facturas, clientes, flota, tarifas, plantillas, tareas, gastos, configuración).
- `audit-log.jsonl`: auditoría append-only en JSONL.
- `backups/<backupId>/manifest.json` + contenido backup.

## Auditoría
Acciones auditables tipadas:
- `AUTH_LOGIN`
- `AUTH_LOGOUT`
- `UI_OPEN_MODULE`
- `RBAC_DENIED`
- `OVERRIDE_CONFIRMATION`
- `SYSTEM`
- `AUDIT_SUPPRESS`

Comportamiento:
- Escritura append-only en `audit-log.jsonl`.
- Lectura de últimos eventos (límite 100 por defecto).
- Supresión lógica de eventos vía `AUDIT_SUPPRESS` (solo oculta en vistas, no borra físicamente).

## Backups y restore
- Servicio: `src/lib/services/backup-service.ts`.
- Backup FULL incluye, si existen:
  - `rental-store.json`
  - `audit-log.jsonl`
  - `attachments`
  - `templates`
  - `pdfs`
  - `config`
- Integridad: checksum por fichero + checksum global de manifest.
- Concurrencia: lock de backup/restore con `.backup.lock`.
- Restore:
  - valida integridad del backup
  - crea `SAFETY_SNAPSHOT`
  - copia ficheros al data dir activo
  - registra auditoría de restore.

## Numeración
Patrones implementados:
- Reserva: `RSV-{AAAA}-{contador_6}`.
- Contrato: `{aa}-{SUCURSAL}-{contador_5}`.
- Factura: `{SERIE}{aa}-{SUCURSAL}-{contador_5}`.

Series configurables desde `Gestor` (`invoiceSeriesByType`).
