# Operación y despliegue local

## Requisitos
- Node.js compatible con Next.js `16.1.6`.
- Dependencias instaladas con `npm install`.

## Arranque local
1. Crear entorno local:
   - `cp .env.example .env.local`
2. Instalar dependencias:
   - `npm install`
3. Ejecutar:
   - `npm run dev`
4. Abrir:
   - `http://localhost:3203/login`

## Scripts
- `npm run dev`: desarrollo en puerto `3203`.
- `npm run build`: build de producción.
- `npm run start`: servidor producción en puerto `3203`.
- `npm run lint`: lint del proyecto.
- `npm run seed:demo`: carga dataset demo en store.
- `npm run healthcheck`: verificación operativa contra servidor activo.
- `npm run validate:data`: integridad referencial y consistencia del store.
- `npm run validate:audit`: cobertura de auditoría.
- `npm run test:auth`: login/dashboard/logout.
- `npm run test:flujo-core`: flujo reserva -> contrato -> caja -> cierre -> factura.
- `npm run test:audit-suppress`: supresión lógica de auditoría.
- `npm run test:gastos`: flujo de gastos internos/diarios.
- `npm run test:backup`: backup y restore.
- `npm run test:integridad`: validaciones automáticas de integridad.

## Variables de entorno
- `RENTIQ_DATA_DIR`
  - directorio de persistencia.
  - default: `./.rentiq-v3-data`.

- `BACKUP_SCHEDULE_TOKEN`
  - token bearer para `POST /api/backups/scheduled`.

- `BACKUP_RETENTION_DAYS`
  - fallback de retención cuando no hay valor válido en store.
  - default lógico: `90`.

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_SECURE`
- `SMTP_TIMEOUT_MS`
- `MAIL_FROM`
  - requeridas para envío real y/o verificación SMTP.
  - `companyEmailFrom` (Gestor) puede sobrescribir remitente.

## Backups

### Programado
- Endpoint: `POST /api/backups/scheduled`.
- Requiere bearer token válido.
- Ventana normal: 03:00-03:09 (`Europe/Madrid`).
- `force=true` permite ejecutar fuera de ventana.

Ejemplo cron:
```bash
CRON_TZ=Europe/Madrid
0 3 * * * curl -X POST http://localhost:3203/api/backups/scheduled -H "Authorization: Bearer REEMPLAZAR_TOKEN_SEGURO"
```

### Forzado manual
- Desde `/gestor`.
- Requiere rol `SUPER_ADMIN`.

### Restore
- Desde `/gestor`.
- Requiere rol `SUPER_ADMIN`.
- Requiere doble confirmación:
  - selector `confirmStep1=true`
  - texto exacto `RESTAURAR`.
- Flujo técnico:
  1. valida integridad del backup
  2. crea `SAFETY_SNAPSHOT`
  3. copia datos al directorio activo
  4. registra auditoría `restore`.
