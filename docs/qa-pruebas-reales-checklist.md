# QA Pruebas Reales - Checklist Operativo

Fecha base: 2026-03-05  
Objetivo: validar operación real end-to-end, sin suposiciones, con evidencia por caso.

## 1) Preparación de entorno

- [x] `npm run seed:demo` ejecutado sin error.
- [x] Login válido en `SUPER_ADMIN`, `ADMIN`, `LECTOR`.
- [ ] Sucursales configuradas y visibles.
- [ ] Catálogos mínimos cargados:
  - [ ] Grupos y modelos de vehículo.
  - [ ] Flota activa con matrículas.
  - [ ] Clientes (particular y empresa).
  - [ ] Canales de venta.
  - [ ] Tarifas con tramos y precios.
- [ ] Salud técnica:
  - [x] `/api/health` devuelve `ok: true`.
  - [x] `npm run lint` sin errores.
  - [x] `npm run test:flujo-core` OK.
  - [x] `npm run test:tarifas` OK.
  - [x] `npm run test:e2e` OK.

Evidencia:
- Enlace/captura: consola local (2026-03-06).
- Resultado:
  - `npm run seed:demo -- --force` -> `OK seed:demo`.
  - `npm run healthcheck` -> `HEALTHCHECK OK` (incluye login/logout + data_integrity).
  - `npm run test:flujo-core` -> OK.
  - `npm run test:tarifas` -> OK.
  - `npm run test:e2e` -> 17 passed, 5 skipped, 0 failed (skips condicionados por dataset sin celdas activas/huérfanas en Planning y sin dataset válido para dos casos legacy).
  - `npm run lint` -> OK (0 errores, warnings no bloqueantes).

## 2) Permisos por rol (RBAC)

### SUPER_ADMIN
- [x] Acceso completo a todos los módulos.
- [ ] Puede crear/editar/borrar en módulos críticos.

### ADMIN
- [x] Acceso operativo completo salvo restricciones de super-admin.
- [ ] Puede operar reservas, contratos, facturación, gestor operativo.

### LECTOR
- [x] No ve `Vehículos` ni `Clientes` en menú.
- [x] URL directa a `Vehículos` y `Clientes` redirige a dashboard.
- [x] En dashboard:
  - [x] `Nueva reserva` bloqueado con alerta.
  - [x] `Nuevo contrato` bloqueado con alerta.
  - [x] `Planning` bloqueado con alerta.
  - [x] `Gastos` accesible.

Evidencia:
- Enlace/captura: `tests/e2e/roles.spec.ts`.
- Resultado:
  - `super-admin ve módulos de gestión completos` -> OK.
  - `admin ve módulos operativos completos` -> OK.
  - `lector no ve módulos bloqueados en menú` -> OK.
  - `lector: accesos rápidos bloqueados muestran alerta y gastos sí abre` -> OK.

## 3) Reservas

- [x] Crear reserva completa (cliente, tramo, canal, grupo, importes).
- [x] Si no hay cliente, botón de crear cliente funciona.
- [x] Carga por ID/nombre autocompleta datos de cliente.
- [ ] Estados correctos (`PETICION` / `CONFIRMADA`).
- [x] Extras:
  - [x] Añadir extra.
  - [x] Unidades, precio unidad y total coherentes.
- [x] Conductores adicionales:
  - [x] Nombre.
  - [x] Carnet.
- [x] Notas:
  - [x] Públicas guardan.
  - [x] Privadas guardan.
- [x] Si cambia grupo y precio no bloqueado, pregunta de recálculo.
- [x] Auditoría disponible para la reserva.

Evidencia:
- Nº reserva: `RSV-2026-000003` (ejecución E2E).
- Captura: artefactos Playwright (`tests/e2e/reservas.spec.ts`).
- Resultado:
  - `reservas: botón crear cliente abre ficha` -> OK.
  - `reservas: autocompletado por ID y por nombre` -> OK.
  - `reservas: creación PETICION con extras/notas/conductor + auditoría` -> OK.
  - Pendiente: validación completa de creación en estado `CONFIRMADA` en este bloque.

## 4) Contratos

- [ ] Crear contrato desde reserva confirmada.
- [x] `Localizar contrato` -> `Abrir gestión` carga datos (no en blanco).
- [x] Si contrato facturado: no editable y aviso correcto.
- [x] Renumeración formato `AA-SUC-####`.
- [x] Cambio de vehículo:
  - [x] Registra datos operativos.
  - [x] Respeta restricciones (cerrado/facturado).
- [x] Asignación de matrícula manual funcional.
- [x] Cierre de contrato:
  - [x] Requiere caja.
  - [x] Genera factura.
- [ ] PDF contrato:
  - [ ] Desglose de precios correcto.
  - [ ] Incluye franquicia.
  - [ ] Incluye secciones completas (conductores, cambios, observaciones, firmas).

Evidencia:
- Nº contrato: creado dinámicamente en pruebas E2E (`26/ALC/00xx`).
- Captura/PDF: artefactos Playwright (`tests/e2e/contratos.spec.ts`).
- Resultado:
  - `contratos: localizar -> abrir gestión carga datos y PDF responde` -> OK.
  - `contratos: cierre requiere caja y tras facturar queda bloqueado` -> OK.
  - `contratos: renumeración, cambio de vehículo y asignación manual` -> OK.
  - Pendiente: validación visual detallada del contenido interno del PDF de contrato.

## 5) Planning

- [x] Vista principal carga sin errores.
- [ ] Resumen lateral al clic simple con estilo correcto.
- [ ] Doble clic abre reserva o contrato según estado.
- [ ] Reasignación drag & drop:
  - [ ] Reserva/petición permite cambio.
  - [ ] Huérfana asigna matrícula.
  - [ ] Contratada no permite cambio.
  - [ ] Si cambia de grupo, muestra aviso.
- [ ] Huérfanas visibles y desaparecen al asignar matrícula.
- [x] Selector de sucursal operativo.

Evidencia:
- Captura: artefactos Playwright (`tests/e2e/planning.spec.ts`).
- Resultado:
  - `planning: carga principal, selector de sucursal y resumen por clic` -> OK.
  - `planning: resumen lateral por clic cuando hay celdas activas` -> SKIP (dataset sin celdas activas en esta ejecución).
  - `planning: doble clic abre reserva/contrato` -> SKIP (dataset sin celdas draggeables).
  - `planning: huérfanas visibles y drag & drop operativo cuando existen` -> SKIP (dataset sin huérfanas).

## 6) Facturación

- [x] Diario contable carga y filtra.
- [x] Crear factura manual desde pestaña superior.
- [ ] Tipos de factura:
  - [x] `F` (Generales).
  - [x] `V` (Venta vehículo).
  - [x] `R` (Rectificativa).
  - [x] `A` (Abono).
- [ ] Numeración según configuración empresa:
  - [ ] Global.
  - [ ] Por sucursal.
- [ ] Campos de importes en manual:
  - [x] Base.
  - [x] IVA.
  - [x] Total calculado.
- [ ] PDF factura:
  - [ ] Cabecera con logo y datos empresa.
  - [ ] Receptor en bloque independiente.
- [x] Envío email y log de envío.

Evidencia:
- Nº factura: generadas manuales en test E2E (F/V/R/A).
- Captura/PDF: artefactos Playwright (`tests/e2e/facturacion.spec.ts`).
- Resultado:
  - `facturación: diario carga, filtra y exporta` -> OK.
  - `facturación: crear factura manual F/V/R/A` -> OK.
  - `facturación: pestañas gastos, conciliación, envíos y estadísticas/canales` -> OK.
  - Pendiente: validación visual y de numeración por modo global/sucursal.

## 7) Dashboard

- [x] KPIs superiores correctos (`Entregas hoy`, `Recogidas hoy`, `Tareas pendientes`).
- [x] Agenda y Alertas sin duplicidades.
- [x] Alertas con desplegables funcionales.
- [ ] Resumen mensual:
  - [x] Selector año.
  - [x] Métrica entregas/reservas.
  - [x] Barras proporcionales.
- [ ] Previsión:
  - [x] Gráfica visible.
  - [x] Selector de rango visible y funcional.
  - [x] Saldo global correcto.

Evidencia:
- Captura: artefactos Playwright (`tests/e2e/dashboard.spec.ts`).
- Resultado:
  - `dashboard: KPIs superiores y cards principales` -> OK.
  - `dashboard: alertas desplegables funcionales` -> OK.
  - `dashboard: resumen mensual y previsión con rango` -> OK.

## 8) Gestor / Configuración / Plantillas

- [ ] Usuarios: alta, edición, desactivación y permisos.
- [ ] Sucursales: alta, edición, horarios.
- [ ] Tarifas: creación y mantenimiento de tramos/precios.
- [ ] Canales de venta:
  - [ ] Añadir canal.
  - [ ] Disponible en reserva (desplegable).
- [ ] Plantillas documentales:
  - [ ] Selector plantilla/sucursal/idioma.
  - [ ] Editor HTML/CSS y editor visual básico.
  - [ ] Macros en formato `{macro}`.
  - [ ] Botones ver/descargar/subir/modificar.
- [ ] Idioma cliente aplicado a documentos generados.

Evidencia:
- Captura:
- Resultado:

## 9) Modo oscuro / responsive / UX base

- [ ] Auto tema por dispositivo funciona.
- [ ] Cambio manual (`A/C/O`) funciona.
- [ ] Login en oscuro con contraste correcto.
- [ ] Reservas/Contratos/Clientes/Ayuda sin fallos de contraste.
- [ ] Sidebar responsive con hamburguesa y navegación usable.
- [ ] Botones/chips/selects coherentes en tamaño y texto completo.

Evidencia:
- Captura desktop:
- Captura móvil:
- Resultado:

## 10) Registro de incidencias

Formato mínimo por incidencia:

| ID | Módulo | Caso | Severidad | Reproducible | Evidencia | Estado |
|---|---|---|---|---|---|---|
| BUG-001 | Reservas | Ejemplo | Alta | Sí | URL/captura | Abierta |
| BUG-002 | Frontend/Theme | `npm run lint` falla por `react-hooks/set-state-in-effect` en `src/components/app-layout.tsx` y `src/components/theme-provider.tsx` | Media | Sí | salida `npm run lint` (2026-03-06) | Cerrada |

Severidad:
- Alta: bloquea operación/facturación/cierre.
- Media: flujo alternativo posible.
- Baja: visual o no bloqueante.

## 11) Cierre de pasada

- [ ] Incidencias altas resueltas o aceptadas.
- [ ] Incidencias medias planificadas.
- [ ] Documento de resultados actualizado.
- [ ] Decisión de paso a pruebas con datos reales de negocio.
