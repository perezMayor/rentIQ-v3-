# ADR (Architecture Decision Records)

Registro de decisiones técnicas transversales.

## Cuándo crear un ADR
- Cambio en reglas de `docs/CORE_RULES.md`.
- Excepción técnica que impacta más de un módulo.
- Cambio de contrato o patrón arquitectónico global.

## Convención de nombres
- `NNNN-titulo-corto.md` (ejemplo: `0001-versionado-eventos.md`).
- Numeración incremental sin reutilizar números.

## Estado sugerido
- `Propuesto`
- `Aceptado`
- `Reemplazado`
- `Obsoleto`

## Flujo
- Crear desde plantilla `docs/adr/0000-template.md`.
- Referenciar ADR en la PR correspondiente.
- Si reemplaza otro ADR, enlazar ambos.
