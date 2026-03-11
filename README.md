# RentIQ Gestión V3

Aplicación de gestioón para RAC

## Aislamiento aplicado
- Puerto fijo V3: `3203`
- Cookie de sesión exclusiva: `rq_v3_session`
- Datos locales exclusivos: `RENTIQ_DATA_DIR` (por defecto `./.rentiq-v3-data`)
- Turbopack root fijado al directorio V3 (evita detección del workspace padre)

## Ejecución
1. Copiar entorno:
```bash
cp .env.example .env.local
```
2. Instalar dependencias:
```bash
npm install
```
3. Arrancar:
```bash
npm run dev
```
4. Abrir:
- [http://localhost:3203/login](http://localhost:3203/login)

## Validación
```bash
npm run lint
npm run validate:data
npm run validate:audit
npm run build
```

## Seed demo y pruebas funcionales
```bash
npm run seed:demo
```

Para demo aislada reproducible y checklist de validación:
- `docs/demo-checklist.md`

## Backup diario 03:00 Europe/Madrid
La app expone:
- `POST /api/backups/scheduled`
- Requiere header `Authorization: Bearer $BACKUP_SCHEDULE_TOKEN`
- Ejecuta backup solo en ventana de las 03:00 (Europe/Madrid), salvo `?force=true`.
- Retención configurable con `BACKUP_RETENTION_DAYS` (default 90).

Ejemplo de cron (máquina/app server) con zona horaria Madrid:
```bash
CRON_TZ=Europe/Madrid
0 3 * * * curl -X POST http://localhost:3203/api/backups/scheduled -H "Authorization: Bearer REEMPLAZAR_TOKEN_SEGURO"
```

## Envío real de email (dominio empresa)
Requiere SMTP configurado:
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_SECURE`
- `MAIL_FROM`

Además, en Gestor puedes definir `Email emisor empresa` para sobrescribir `MAIL_FROM`.

## Documentación técnica
- Índice: `docs/README.md`
- Arquitectura: `docs/arquitectura.md`
- Módulos y flujos: `docs/modulos-y-flujos.md`
- Operativa por módulo: `docs/operativa-modulos.md`
- API HTTP: `docs/api.md`
- Operación: `docs/operacion.md`
