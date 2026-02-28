# QA E2E V3 (Operativo)

## 1) Reservas -> Contratos

- Crear reserva en estado `CONFIRMADA` y verificar:
  - Aparece botón `Generar contrato` al abrir la reserva en `Reservas > Gestión`.
  - Si la reserva no está confirmada, no aparece botón.
- Generar contrato desde reserva confirmada:
  - Redirige a `Contratos > Gestión`.
  - Se crea vínculo reserva/contrato.
- En listados `Entregas`, `Recogidas` y `Localizar reserva`:
  - Si existe contrato, aparece acción `Abrir contrato`.

## 2) Contratos

- `Contratos > Gestión`:
  - Carga por `nº contrato` o por acceso directo con `contractId`.
  - `Imprimir contrato` disponible.
- `Cerrar contrato`:
  - Sin caja: bloquea cierre con mensaje.
  - Con caja: permite cierre y genera factura automática.
- `Cambio de vehículo`:
  - Si fecha/hora de cambio es anterior a entrega, bloquea operación.
- `Localizar contrato`:
  - Botones: `Abrir gestión`, `Imprimir`, `Auditoría`.

## 3) Clientes

- `Dar de baja` (listado, histórico y ficha):
  - Si cliente tiene al menos 1 contrato histórico: no permite baja.
  - Si no tiene contratos: permite baja.

## 4) Vehículos > Listados

- No muestra todos los listados por defecto.
- Con filtro `Selecciona listado` + `Generar`:
  - Muestra solo el listado seleccionado.
  - `Exportar listado` exporta solo ese tipo.

## 5) Backups (Gestor)

- `Gestor > Backups`:
  - Ver estado último backup e histórico.
  - `Forzar backup` solo `SUPER_ADMIN`.
  - `Restaurar` requiere doble confirmación.

## 6) Validación técnica

- Ejecutar:
  - `npm run build`
  - `npm run lint`

