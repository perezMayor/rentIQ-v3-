# CORE_RULES

Reglas técnicas transversales para todos los módulos de `rentiq_gestion_V3`.

## 0. Alcance
- Este documento define reglas técnicas, no decisiones de negocio.
- Si existe conflicto entre módulos, prevalece este documento hasta que se apruebe un ADR.
- Ningún módulo puede declarar excepciones locales sin ADR asociado.

## 1. Contratos de API
- Todo endpoint HTTP debe estar documentado en `docs/api.md`.
- Cambios incompatibles deben versionarse y declararse explícitamente.
- Ningún consumidor puede depender de campos no documentados.

## 2. Datos y persistencia
- Todo cambio de esquema requiere migración explícita.
- Las migraciones deben ser reversibles o incluir plan de rollback documentado.
- No se permite escritura silenciosa en tablas no declaradas para el módulo.

## 3. Autorización y acceso
- Toda acción de lectura/escritura debe validar rol/permisos en backend.
- Nunca se considera el control de UI como control de seguridad suficiente.
- Si cambia una regla de permisos, debe reflejarse en `docs/modulos-y-flujos.md`.

## 4. Trazabilidad y auditoría
- Operaciones críticas deben dejar rastro auditable (quién, cuándo, qué cambió).
- Errores de dominio y de infraestructura deben registrarse con contexto mínimo útil.
- No se permiten errores silenciados sin registro.

## 5. Manejo de errores
- Todo endpoint debe responder errores con formato consistente.
- No exponer stack traces ni secretos en respuestas al cliente.
- Validaciones fallidas deben devolver códigos y mensajes coherentes.

## 6. Eventos e integraciones
- Todo evento publicado debe tener contrato explícito y estable.
- Cambios en payload de eventos requieren versionado o compatibilidad retroactiva.
- Ningún módulo puede consumir eventos sin validar schema esperado.

## 7. Testing mínimo obligatorio
- Cada cambio debe incluir al menos un test de la capa afectada (unit/integration/e2e según impacto).
- Cambios en contratos requieren test de contrato.
- Bugs corregidos deben agregar test de no regresión.

## 8. Convenciones de entrega
- PR pequeña y enfocada en un único objetivo técnico.
- Toda PR debe completar `docs/INTEGRATION_CHECKLIST.md`.
- Si el cambio afecta reglas de este documento, se requiere ADR en `docs/adr/`.

## 9. Proceso de excepción (ADR)
- Proponer excepción con contexto técnico verificable.
- Registrar decisión en `docs/adr/` antes de merge.
- Incluir plan de migración para módulos afectados.
