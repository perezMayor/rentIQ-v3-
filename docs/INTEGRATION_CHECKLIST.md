# INTEGRATION_CHECKLIST

Checklist obligatorio para cualquier PR con impacto técnico.

## Instrucciones de uso
- Marcar cada punto como `SI`, `NO` o `N/A`.
- Si una respuesta es `SI`, adjuntar evidencia (archivo, test, commit o captura de log).
- Si una respuesta es `N/A`, justificar brevemente.

## 1. Datos y migraciones
- ¿Hay cambios de esquema o migraciones?
- ¿Se probó upgrade y rollback?
- ¿Existe plan de backfill si aplica?

## 2. API y contratos
- ¿Cambian endpoints, payloads, códigos o validaciones?
- ¿`docs/api.md` está actualizado?
- ¿Se añadió test de contrato/compatibilidad?

## 3. Permisos y seguridad
- ¿Cambian reglas de rol/permisos?
- ¿La autorización está validada en backend?
- ¿Se evitó exponer datos sensibles en logs/respuestas?

## 4. Eventos e integraciones
- ¿Se agregan o modifican eventos?
- ¿El schema del evento está documentado y versionado?
- ¿Se validó compatibilidad con consumidores actuales?

## 5. Observabilidad
- ¿Hay logs de éxito/fallo en operaciones críticas?
- ¿Errores críticos quedan trazables con contexto?
- ¿Se agregaron/ajustaron métricas o alertas si aplica?

## 6. Testing
- ¿Hay tests unitarios para lógica cambiada?
- ¿Hay tests de integración para flujo afectado?
- ¿Hay test de no regresión para bugs corregidos?

## 7. Documentación
- ¿El cambio referencia sección de `docs/CORE_RULES.md`?
- ¿Se requiere ADR? En caso afirmativo: ¿está añadido en `docs/adr/`?
- ¿`docs/modulos-y-flujos.md` u otra documentación quedó actualizada?

## 8. Validación final
- ¿Se ejecutaron checks de CI localmente?
- ¿Se revisó impacto cruzado en otros módulos?
- ¿El alcance real coincide con el objetivo de la PR?
