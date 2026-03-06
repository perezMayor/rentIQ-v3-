# Documentación técnica V3

Documentación técnica de `rentiq_gestion(V3)` alineada con el estado actual del código.

## Índice
- `docs/arquitectura.md`: stack, estructura, control de acceso, persistencia y auditoría.
- `docs/modulos-y-flujos.md`: rutas de UI, permisos por rol y flujo operativo por módulo.
- `docs/operativa-modulos.md`: acciones principales por módulo (entradas, validaciones, efectos).
- `docs/api.md`: endpoints HTTP y contrato técnico actual.
- `docs/operacion.md`: arranque local, scripts, variables de entorno, backups y restore.
- `docs/demo-checklist.md`: guía rápida de demo en entorno aislado.
- `docs/qa-pruebas-reales-checklist.md`: checklist ejecutable para pruebas reales módulo a módulo con evidencia.
- `docs/CORE_RULES.md`: reglas técnicas transversales obligatorias para todos los módulos.
- `docs/INTEGRATION_CHECKLIST.md`: checklist obligatorio de integración para PRs.
- `docs/adr/README.md`: guía de ADR y convención de registro de decisiones técnicas.
- `docs/adr/0000-template.md`: plantilla base para nuevos ADR.

## Criterio
- Se documenta solo comportamiento implementado en código.
- No se añaden reglas de negocio implícitas ni estados no definidos.
- Si un bloque está en placeholder, se marca explícitamente.
