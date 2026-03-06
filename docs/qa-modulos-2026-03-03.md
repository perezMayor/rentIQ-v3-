# QA Módulo a Módulo - 2026-03-03

## Resultado global
- Estado: OK
- Build producción: OK
- Lint: OK
- Healthcheck funcional: OK
- Integridad de datos: OK
- Cobertura de auditoría: OK

## Checklist por módulo

| Módulo | Verificación | Estado |
|---|---|---|
| Login / Sesión | Login por email+password, cookie de sesión, logout | OK |
| Dashboard | Carga autenticada y navegación protegida | OK |
| Reservas | Flujo creación/edición/cierre en tests de flujo | OK |
| Contratos | Conversión desde reserva, renumeración y cierre | OK |
| Facturación | Emisión y datos contables en flujo core | OK |
| Gastos | Gasto interno + diario + conciliación en tests | OK |
| Backups | Alta y validación de backup en script dedicado | OK |
| Auditoría | Cobertura mínima y suppress controlado | OK |
| Integridad datos | Reglas de integridad del store | OK |
| Extras | Cálculo y comportamiento de extras | OK |
| Plantillas | Carga/listado y macros soportadas | OK |
| Configuración | Datos de empresa para documentos | OK |
| Entregas/Recogidas | Rutas incluidas en build y flujo operativo | OK |
| Vehículos | Cobertura por flujo de asignación y producción | OK |
| Clientes | Resolución de cliente en flujos reserv/contrato | OK |
| Tarífas | Resolución en métricas de contrato/factura | OK |
| Ayuda | Rutas incluidas en build | OK |
| Gestor | Rutas y acciones incluidas en build | OK |

## Incidencias detectadas y corregidas

1. Scripts QA de autenticación desalineados con login actual
- Síntoma: `test:auth` y `healthcheck` fallaban por enviar `role` en lugar de `email/password`.
- Corrección: actualización de payload de login.
- Archivos: `scripts/test-auth-flow.mts`, `scripts/healthcheck.mts`.

2. Conflicto de lock de Next dev durante pruebas
- Síntoma: imposibilidad de iniciar `next dev` en QA si había otra instancia activa.
- Corrección: soporte de `NEXT_DIST_DIR` en configuración y aislamiento por directorio temporal para tests.
- Archivos: `next.config.ts`, `scripts/test-auth-flow.mts`, `scripts/healthcheck.mts`.

3. Lint contaminado por artefactos temporales de QA
- Síntoma: eslint analizaba bundles generados de pruebas.
- Corrección: ignores explícitos para carpetas temporales de QA.
- Archivo: `eslint.config.mjs`.

## Comandos ejecutados en esta pasada
- `npm run healthcheck`
- `npm run test:auth`
- `npm run test:flujo-core`
- `npm run test:audit-suppress`
- `npm run test:gastos`
- `npm run test:backup`
- `npm run test:integridad`
- `npm run test:extras`
- `npm run validate:data`
- `npm run validate:audit`
- `npm run lint`
- `npm run build`
