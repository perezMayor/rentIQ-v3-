# Checklist demo interna

Guion operativo para probar la V3 con datos reproducibles sin tocar la instalación de trabajo.

## 1) Preparar entorno aislado
```bash
cd "/Users/javierperez/Desktop/rentiq_gestion_V3"
export RENTIQ_DATA_DIR="$(pwd)/.tmp/demo-data"
rm -rf "$RENTIQ_DATA_DIR"
mkdir -p "$RENTIQ_DATA_DIR"
```

## 2) Cargar datos demo
```bash
npm run seed:demo
```

Notas:
- Si el store no está vacío, el seed se bloquea.
- Solo usar `npm run seed:demo -- --force` cuando se quiera forzar sobre datos existentes.

## 3) Arrancar y acceder
```bash
npm run dev
```

Abrir:
- `http://localhost:3203/login`

## 4) Validaciones rápidas de negocio
1. `Reservas`: existe una reserva demo convertida a contrato.
2. `Contratos`: el contrato demo está cerrado con caja registrada.
3. `Facturación`: existe factura generada automáticamente por cierre de contrato.
4. `Gastos`: existe gasto diario interno (categoría gasolina) con matrícula activa.
5. `Producción`: el gasto interno impacta rentabilidad y no aparece en factura.
6. `Vehículos`: hay flota demo con grupos A/B.
7. `Clientes`: existen cliente particular y cliente empresa.
8. `Tarifas`: plan `TP-DEMO` con tramos 1, 3, 7 y extra.

## 5) Suite técnica mínima
```bash
npm run validate:data
npm run validate:audit
npm run test:auth
npm run test:flujo-core
npm run test:gastos
npm run test:backup
npm run test:integridad
npm run build
```

## 6) Limpieza demo
```bash
rm -rf "$RENTIQ_DATA_DIR"
unset RENTIQ_DATA_DIR
```
