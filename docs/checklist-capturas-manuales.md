# Checklist de capturas para manuales de Ayuda

Objetivo: sustituir los placeholders en `public/manuales/...` por capturas reales, consistentes y útiles para operación.

## Reglas generales

1. Usa la misma resolución en todas las capturas (recomendado: 1280x720).
2. Incluye siempre: título de pantalla + menú/pestaña activa + contenido principal.
3. Evita datos sensibles reales (DNI, correo, teléfono, importes reales, matrículas reales): usa datos de demo.
4. Guarda en formato `.png` (recomendado) manteniendo exactamente el nombre de archivo actual.
5. Si el flujo tiene filtros, deja los filtros visibles en la captura.
6. Verifica legibilidad de texto antes de subir.

## Mapa de capturas

### Reservas

- Archivo: `public/manuales/reservas/01-alta-confirmacion.svg`
- Debe mostrar:
  - Módulo `Reservas` abierto en pestaña `Gestión`.
  - Formulario de alta o edición visible.
  - Campos principales cumplimentados (cliente, fechas, grupo, canal).
  - Estado visible tras guardar/confirmar.

- Archivo: `public/manuales/reservas/02-asignacion-contrato.svg`
- Debe mostrar:
  - `Reservas` en pestaña `Planning` o bloque de asignación.
  - Reserva seleccionada y matrícula asignada.
  - Acción de generar contrato visible o resultado de generación.

### Contratos

- Archivo: `public/manuales/contratos/01-gestion.svg`
- Debe mostrar:
  - Módulo `Contratos` en vista de gestión/listado.
  - Filtros o búsqueda visibles.
  - Al menos un contrato con estado visible.

- Archivo: `public/manuales/contratos/02-cierre-facturacion.svg`
- Debe mostrar:
  - Vista de contrato con datos de cierre o estado `CERRADO`.
  - Información de liquidación/resumen económico visible.
  - Evidencia de que queda listo para facturación.

### Entregas y Recogidas

- Archivo: `public/manuales/entregas-recogidas/01-entrega.svg`
- Debe mostrar:
  - Módulo `Entregas`.
  - Formulario de salida con km, combustible y notas.
  - Contrato/unidad identificable (sin datos sensibles).

- Archivo: `public/manuales/entregas-recogidas/02-recogida.svg`
- Debe mostrar:
  - Módulo `Recogidas`.
  - Formulario de entrada con km, combustible e incidencias.
  - Estado de finalización/registro visible.

### Facturación

- Archivo: `public/manuales/facturacion/01-emision.svg`
- Debe mostrar:
  - Módulo `Facturación` en emisión/listado.
  - Contrato seleccionable para facturar o factura recién generada.
  - Número de factura o estado visible.

- Archivo: `public/manuales/facturacion/02-conciliacion.svg`
- Debe mostrar:
  - Pestaña o bloque de conciliación.
  - Filtros de rango de fechas.
  - Tabla/resumen de resultados de conciliación.

### Vehículos

- Archivo: `public/manuales/vehiculos/01-alta.svg`
- Debe mostrar:
  - Módulo `Vehículos` con formulario de alta.
  - Campos clave: matrícula, categoría/grupo, estado.

- Archivo: `public/manuales/vehiculos/02-edicion-estado.svg`
- Debe mostrar:
  - Edición de una unidad existente.
  - Cambio de estado/disponibilidad visible.

### Clientes

- Archivo: `public/manuales/clientes/01-alta.svg`
- Debe mostrar:
  - Módulo `Clientes` con alta de cliente.
  - Campos obligatorios visibles.

- Archivo: `public/manuales/clientes/02-mantenimiento.svg`
- Debe mostrar:
  - Edición de cliente existente.
  - Actualización de datos de contacto/fiscales.

### Gestor y Configuración

- Archivo: `public/manuales/gestor-configuracion/01-catalogos.svg`
- Debe mostrar:
  - Módulo `Gestor` en un catálogo operativo.
  - Listado y acción de alta/edición visible.

- Archivo: `public/manuales/gestor-configuracion/02-parametros.svg`
- Debe mostrar:
  - Módulo `Configuración` con parámetros globales.
  - Cambio o valor de parámetro visible.

## Sustitución de archivos

1. Genera la captura real.
2. Renombra con el nombre exacto del archivo objetivo.
3. Reemplaza el archivo en `public/manuales/...`.
4. Refresca `/ayuda/<manual>` y confirma que se visualiza.

## Validación final

1. Recorre todos los manuales en `/ayuda`.
2. Comprueba que no queda ningún placeholder.
3. Verifica coherencia entre captura y texto del bloque.
4. Verifica versión móvil (ancho reducido) para legibilidad.
