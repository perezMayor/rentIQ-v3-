// Módulo manuals.ts.
export type ManualBlock = {
  id: string;
  title: string;
  context: string;
  screenshot: { src: string; caption: string };
  setup: string[];
  menus: string[];
  steps: string[];
};

export type ManualItem = {
  slug: string;
  title: string;
  summary: string;
  targetPath: string;
  blocks: ManualBlock[];
};

export const MANUALS: ManualItem[] = [
  {
    slug: "reservas",
    title: "Manual de Reservas",
    summary: "Alta, confirmación, asignación y generación de contrato desde reservas.",
    targetPath: "/reservas",
    blocks: [
      {
        id: "reserva-alta",
        title: "Alta y confirmación de reserva",
        context: "Bloque para registrar correctamente una reserva y dejarla lista para operación.",
        screenshot: { src: "/manuales/reservas/01-alta-confirmacion.svg", caption: "Reservas - Formulario de alta" },
        setup: [
          "Verifica que el cliente exista en el módulo Clientes; si no existe, créalo antes.",
          "Comprueba rol: LECTOR no puede guardar ni confirmar reservas.",
          "Define tramo con fechas válidas (entrega < recogida) y sucursal asignada.",
        ],
        menus: [
          "Menú lateral -> Reservas.",
          "Pestaña Gestión -> Formulario de alta/edición.",
        ],
        steps: [
          "Pulsa 'Nueva reserva'.",
          "Completa datos obligatorios: cliente, fechas, grupo facturable y canal.",
          "Guarda y revisa que el estado inicial sea PETICION o CONFIRMADA según tu flujo.",
          "Si procede, confirma la reserva desde la acción de gestión.",
          "Valida que la reserva aparece en el listado con su número y estado correcto.",
        ],
      },
      {
        id: "reserva-asignacion",
        title: "Asignación de matrícula y generación de contrato",
        context: "Bloque para pasar una reserva confirmada a contrato operativo.",
        screenshot: { src: "/manuales/reservas/02-asignacion-contrato.svg", caption: "Reservas - Planning y generar contrato" },
        setup: [
          "La reserva debe estar en estado CONFIRMADA.",
          "La matrícula debe estar disponible para el tramo; si hay solape, revisar política de override.",
          "Confirma grupo y condiciones antes de convertir a contrato.",
        ],
        menus: [
          "Reservas -> Pestaña Planning -> Asignación.",
          "Reservas -> Pestaña Gestión -> Acción 'Generar contrato'.",
        ],
        steps: [
          "Abre Planning y selecciona una reserva sin matrícula.",
          "Asigna matrícula y guarda, registrando motivo si existe override.",
          "Vuelve a Gestión y localiza la reserva recién asignada.",
          "Pulsa 'Generar contrato'.",
          "Verifica redirección a Contratos y existencia del nuevo número de contrato.",
        ],
      },
    ],
  },
  {
    slug: "contratos",
    title: "Manual de Contratos",
    summary: "Operación de contratos: consulta, cambios operativos y control de estado.",
    targetPath: "/contratos",
    blocks: [
      {
        id: "contrato-gestion",
        title: "Consulta y operación diaria",
        context: "Bloque para localizar contratos y ejecutar acciones operativas básicas.",
        screenshot: { src: "/manuales/contratos/01-gestion.svg", caption: "Contratos - Vista de gestión" },
        setup: [
          "El contrato debe existir y estar en estado ABIERTO para cambios operativos.",
          "Comprueba que el usuario tenga permisos de escritura.",
          "Verifica referencia de reserva y matrícula asociada.",
        ],
        menus: [
          "Menú lateral -> Contratos.",
          "Pestaña Gestión -> Búsqueda y acciones por contrato.",
        ],
        steps: [
          "Filtra por número de contrato, cliente o matrícula.",
          "Abre el contrato y revisa datos de tramo y estado.",
          "Ejecuta acciones permitidas (actualización operativa, caja, notas, etc.).",
          "Guarda cambios y revisa auditoría/eventos vinculados.",
        ],
      },
      {
        id: "contrato-cierre",
        title: "Cierre y traspaso a facturación",
        context: "Bloque para cerrar contrato y dejarlo listo para emitir factura.",
        screenshot: { src: "/manuales/contratos/02-cierre-facturacion.svg", caption: "Contratos - Cierre y estado final" },
        setup: [
          "Entrega y recogida deben estar registradas si aplica en tu operación.",
          "Valida importes (base, extras, combustible, seguros, penalizaciones).",
          "Asegura que no hay incidencias abiertas del contrato.",
        ],
        menus: [
          "Contratos -> Gestión -> Acción de cierre.",
          "Facturación -> selección de contratos cerrados.",
        ],
        steps: [
          "Revisa liquidación total del contrato.",
          "Confirma cierre y valida cambio de estado a CERRADO.",
          "Abre Facturación y comprueba que el contrato aparece disponible.",
          "Documenta incidencias o notas de cierre si existen.",
        ],
      },
    ],
  },
  {
    slug: "entregas-recogidas",
    title: "Manual de Entregas y Recogidas",
    summary: "Registro operativo de salida y entrada del vehículo.",
    targetPath: "/entregas",
    blocks: [
      {
        id: "entrega",
        title: "Proceso de entrega",
        context: "Bloque para registrar la salida del vehículo al cliente.",
        screenshot: { src: "/manuales/entregas-recogidas/01-entrega.svg", caption: "Entregas - Registro de salida" },
        setup: [
          "Contrato ABIERTO con matrícula asignada.",
          "Datos mínimos disponibles: km, combustible y observaciones.",
          "Usuario con permisos de operación.",
        ],
        menus: [
          "Menú lateral -> Entregas.",
          "Selecciona la fila/contrato pendiente de entrega.",
        ],
        steps: [
          "Abre el registro de entrega del contrato.",
          "Introduce km de salida y nivel de combustible.",
          "Añade notas y evidencias si procede.",
          "Guarda y verifica creación del evento en trazabilidad.",
        ],
      },
      {
        id: "recogida",
        title: "Proceso de recogida",
        context: "Bloque para registrar la devolución del vehículo y cierre operativo.",
        screenshot: { src: "/manuales/entregas-recogidas/02-recogida.svg", caption: "Recogidas - Registro de entrada" },
        setup: [
          "Contrato activo pendiente de devolución.",
          "Datos de entrada disponibles: km, combustible, incidencias.",
          "Revisar diferencias respecto a la entrega inicial.",
        ],
        menus: [
          "Menú lateral -> Recogidas.",
          "Selecciona contrato/unidad y abre formulario de entrada.",
        ],
        steps: [
          "Registrar km y combustible de entrada.",
          "Anotar daños/incidencias y documentación de soporte.",
          "Guardar y verificar actualización del estado operativo.",
          "Coordinar cierre en Contratos si el tramo finaliza.",
        ],
      },
    ],
  },
  {
    slug: "facturacion",
    title: "Manual de Facturación",
    summary: "Generación de facturas y conciliación operativa.",
    targetPath: "/facturacion",
    blocks: [
      {
        id: "factura-emision",
        title: "Emisión de factura",
        context: "Bloque para emitir factura desde contratos cerrados.",
        screenshot: { src: "/manuales/facturacion/01-emision.svg", caption: "Facturación - Emisión" },
        setup: [
          "Contrato en estado CERRADO.",
          "Datos fiscales del cliente completos.",
          "Importes validados antes de emitir.",
        ],
        menus: [
          "Menú lateral -> Facturación.",
          "Subsección de emisión/gestión de facturas.",
        ],
        steps: [
          "Selecciona contrato disponible para facturar.",
          "Genera factura y revisa numeración/importe.",
          "Descarga PDF o prepara envío por correo.",
          "Confirma que la factura queda listada con estado correcto.",
        ],
      },
      {
        id: "factura-conciliacion",
        title: "Conciliación y control",
        context: "Bloque para seguimiento financiero y revisión de cobros.",
        screenshot: { src: "/manuales/facturacion/02-conciliacion.svg", caption: "Facturación - Conciliación" },
        setup: [
          "Facturas emitidas en período de análisis.",
          "Criterio de fechas y filtros definido.",
          "Acceso a reportes de conciliación/exportación.",
        ],
        menus: [
          "Facturación -> Conciliación.",
          "Facturación -> Exportación/reportes.",
        ],
        steps: [
          "Filtra por rango de fechas y estado.",
          "Revisa cobros pendientes o inconsistencias.",
          "Exporta reporte para control externo si aplica.",
          "Registra acciones de seguimiento.",
        ],
      },
    ],
  },
  {
    slug: "vehiculos",
    title: "Manual de Vehículos",
    summary: "Gestión del inventario de flota y su estado operativo.",
    targetPath: "/vehiculos",
    blocks: [
      {
        id: "vehiculo-alta",
        title: "Alta de vehículo",
        context: "Bloque para registrar una nueva unidad en la flota.",
        screenshot: { src: "/manuales/vehiculos/01-alta.svg", caption: "Vehículos - Alta" },
        setup: [
          "Categorías y grupos previamente definidos.",
          "Matrícula única y datos técnicos validados.",
          "Estado inicial operativo definido.",
        ],
        menus: [
          "Menú lateral -> Vehículos.",
          "Acción 'Nuevo vehículo' o formulario de alta.",
        ],
        steps: [
          "Completa ficha con matrícula, categoría y datos clave.",
          "Guarda y valida que aparece en inventario.",
          "Comprueba disponibilidad para planificación.",
        ],
      },
      {
        id: "vehiculo-edicion",
        title: "Edición y seguimiento de estado",
        context: "Bloque para mantener datos y estado de unidades existentes.",
        screenshot: { src: "/manuales/vehiculos/02-edicion-estado.svg", caption: "Vehículos - Edición y estado" },
        setup: [
          "Seleccionar unidad correcta por matrícula.",
          "Revisar impacto del cambio en reservas/contratos/planning.",
          "Aplicar cambios solo con datos confirmados.",
        ],
        menus: [
          "Vehículos -> listado -> editar unidad.",
          "Vehículos -> estado/disponibilidad.",
        ],
        steps: [
          "Abre ficha de la unidad.",
          "Actualiza campos necesarios (estado, grupo, notas, etc.).",
          "Guarda y verifica resultado en el listado.",
          "Confirma que no se genera incoherencia operativa.",
        ],
      },
    ],
  },
  {
    slug: "clientes",
    title: "Manual de Clientes",
    summary: "Gestión de fichas de cliente para uso en reservas y contratos.",
    targetPath: "/clientes",
    blocks: [
      {
        id: "cliente-alta",
        title: "Alta de cliente",
        context: "Bloque para crear clientes particulares o de empresa.",
        screenshot: { src: "/manuales/clientes/01-alta.svg", caption: "Clientes - Alta" },
        setup: [
          "Determina si el cliente es particular o empresa.",
          "Reúne identificación, datos fiscales y contacto.",
          "Evita duplicados revisando búsqueda previa.",
        ],
        menus: [
          "Menú lateral -> Clientes.",
          "Acción de nuevo cliente/formulario.",
        ],
        steps: [
          "Completa campos obligatorios.",
          "Guarda y valida aparición en listado.",
          "Usa la ficha en una reserva de prueba para confirmar disponibilidad.",
        ],
      },
      {
        id: "cliente-mantenimiento",
        title: "Mantenimiento y actualización",
        context: "Bloque para mantener datos de clientes existentes.",
        screenshot: { src: "/manuales/clientes/02-mantenimiento.svg", caption: "Clientes - Edición" },
        setup: [
          "Identifica cliente por filtro/búsqueda.",
          "Valida documentos nuevos antes de editar.",
          "Revisa impacto en contratos en curso si cambia información fiscal.",
        ],
        menus: [
          "Clientes -> listado -> editar.",
          "Clientes -> filtros de búsqueda.",
        ],
        steps: [
          "Abre la ficha del cliente.",
          "Actualiza únicamente campos confirmados.",
          "Guarda y comprueba persistencia de cambios.",
          "Verifica que reservas/contratos leen los nuevos datos.",
        ],
      },
    ],
  },
  {
    slug: "gestor-configuracion",
    title: "Manual de Gestor y Configuración",
    summary: "Ajustes globales, catálogos y parámetros de operación.",
    targetPath: "/gestor",
    blocks: [
      {
        id: "gestor-catalogos",
        title: "Gestión de catálogos operativos",
        context: "Bloque para altas y mantenimiento de catálogos usados por el sistema.",
        screenshot: { src: "/manuales/gestor-configuracion/01-catalogos.svg", caption: "Gestor - Catálogos" },
        setup: [
          "Permisos ADMIN/SUPER_ADMIN.",
          "Definir alcance del cambio antes de editar.",
          "Comprobar dependencias con reservas, contratos y facturación.",
        ],
        menus: [
          "Menú lateral -> Gestor.",
          "Submódulo de catálogo específico.",
        ],
        steps: [
          "Abrir catálogo objetivo.",
          "Crear/editar registro con nomenclatura consistente.",
          "Guardar y validar disponibilidad en módulos consumidores.",
        ],
      },
      {
        id: "configuracion-parametros",
        title: "Configuración de parámetros globales",
        context: "Bloque para ajustes generales del sistema y operación.",
        screenshot: { src: "/manuales/gestor-configuracion/02-parametros.svg", caption: "Configuración - Parámetros" },
        setup: [
          "Permisos elevados y criterio de cambio definido.",
          "Registrar antes/después de cada parámetro modificado.",
          "Preparar validación posterior en módulos clave.",
        ],
        menus: [
          "Menú lateral -> Configuración.",
          "Sección de parámetros generales.",
        ],
        steps: [
          "Modificar parámetro requerido.",
          "Guardar y anotar motivo del cambio.",
          "Validar efecto en un flujo real (reserva -> contrato -> factura).",
          "Si hay incidencia, revertir con trazabilidad.",
        ],
      },
    ],
  },
];

export function getManualBySlug(slug: string) {
  return MANUALS.find((manual) => manual.slug === slug) ?? null;
}
