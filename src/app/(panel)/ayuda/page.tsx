import Link from "next/link";
import styles from "./ayuda.module.css";

const FLOW_STEPS = [
  {
    title: "Crear reserva en Reservas",
    description: "completa datos de cliente, tramo y condiciones.",
    links: [{ href: "/reservas?tab=gestion", label: "Ir a Reservas (gestión)" }],
  },
  {
    title: "Asignar vehículo",
    description: "valida disponibilidad y asigna matrícula desde planificación.",
    links: [{ href: "/reservas?tab=planning&planningSubtab=asignacion", label: "Ir a Planning de reservas" }],
  },
  {
    title: "Generar contrato",
    description: "sobre una reserva confirmada, genera contrato y verifica estado.",
    links: [{ href: "/reservas?tab=gestion", label: "Ir a Generación de contrato" }],
  },
  {
    title: "Registrar entrega/recogida",
    description: "usa los módulos operativos para control de vehículo.",
    links: [
      { href: "/entregas", label: "Ir a Entregas" },
      { href: "/reservas?tab=recogidas", label: "Ir a Recogidas (en Reservas)" },
    ],
  },
  {
    title: "Facturar",
    description: "emite factura desde contrato cerrado y revisa conciliación.",
    links: [{ href: "/facturacion", label: "Ir a Facturación" }],
  },
] as const;

const GUIDE_SECTIONS = [
  {
    id: "ayuda-reservas",
    title: "Reservas",
    description: "Alta, edición, confirmación, generación de contrato y planificación.",
    links: [{ href: "/reservas", label: "Abrir Reservas" }],
  },
  {
    id: "ayuda-contratos",
    title: "Contratos",
    description: "Consulta, gestión operativa, cambios de vehículo, numeración y reportes.",
    links: [{ href: "/contratos", label: "Abrir Contratos" }],
  },
  {
    id: "ayuda-operaciones",
    title: "Entregas y Recogidas",
    description: "Registro de salida/entrada del vehículo y control operativo del tramo.",
    links: [
      { href: "/entregas", label: "Abrir Entregas" },
      { href: "/reservas?tab=recogidas", label: "Abrir Recogidas (Reservas)" },
    ],
  },
  {
    id: "ayuda-facturacion",
    title: "Facturación",
    description: "Emisión de facturas y seguimiento de conciliación.",
    links: [{ href: "/facturacion", label: "Abrir Facturación" }],
  },
  {
    id: "ayuda-fleet",
    title: "Vehículos",
    description: "Inventario, estado y control operativo de la flota.",
    links: [{ href: "/vehiculos", label: "Abrir Vehículos" }],
  },
  {
    id: "ayuda-clientes",
    title: "Clientes",
    description: "Gestión de clientes particulares y empresa.",
    links: [{ href: "/clientes", label: "Abrir Clientes" }],
  },
  {
    id: "ayuda-gestor",
    title: "Gestor y Configuración",
    description: "Ajustes de operación, catálogos y parámetros de sistema.",
    links: [
      { href: "/gestor", label: "Abrir Gestor" },
      { href: "/configuracion", label: "Abrir Configuración" },
    ],
  },
] as const;

const ROLES = [
  {
    title: "LECTOR",
    items: [
      "Consultar estado operativo en Dashboard, Reservas, Contratos, Recogidas y Facturación.",
      "Revisar trazabilidad y detectar incidencias sin ejecutar cambios.",
    ],
  },
  {
    title: "ADMIN",
    items: [
      "Ejecutar el flujo operativo completo: reserva, asignación, contrato, entrega/recogida y facturación.",
      "Gestionar clientes, vehículos y ajustes operativos en módulos autorizados.",
    ],
  },
  {
    title: "SUPER_ADMIN",
    items: [
      "Todo lo de ADMIN más control de configuración global y supervisión de parámetros críticos.",
      "Validar consistencia de datos y cumplimiento de operación entre módulos.",
    ],
  },
] as const;

const DAILY_CHECKLIST = [
  "Revisar en Dashboard alertas de entregas y recogidas próximas.",
  "Confirmar reservas pendientes y validar asignaciones de matrícula.",
  "Verificar contratos abiertos sin incidencias de tramo o documentación.",
  "Registrar entregas/recogidas del día con datos completos.",
  "Controlar cierre operativo para facturación y conciliación.",
] as const;

export default function AyudaPage() {
  return (
    <div className={styles.root}>
      <section className={styles.hero}>
        <h2>Ayuda operativa</h2>
        <p>Manual paso a paso para operar los módulos principales de RentIQ.</p>
      </section>

      <section className={styles.section} id="flujo-core">
        <h3>Flujo base recomendado</h3>
        <ol className={styles.steps}>
          {FLOW_STEPS.map((step) => (
            <li key={step.title}>
              <strong>{step.title}:</strong> {step.description}
              <span className={styles.inlineGroup}>
                {step.links.map((item) => (
                  <Link key={item.href} href={item.href} className={styles.inlineLink}>
                    {item.label}
                  </Link>
                ))}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.section} id="modulos">
        <h3>Guía por sección</h3>
        <nav className={styles.inlineGroup}>
          {GUIDE_SECTIONS.map((section) => (
            <Link key={section.id} href={`#${section.id}`} className={styles.inlineLink}>
              {section.title}
            </Link>
          ))}
        </nav>
        {GUIDE_SECTIONS.map((section) => (
          <article key={section.id} id={section.id} className={styles.topic}>
            <h4>{section.title}</h4>
            <p>{section.description}</p>
            <span className={styles.inlineGroup}>
              {section.links.map((item) => (
                <Link key={item.href} href={item.href} className={styles.inlineLink}>
                  {item.label}
                </Link>
              ))}
            </span>
          </article>
        ))}
      </section>

      <section className={styles.section} id="roles">
        <h3>Guía por rol</h3>
        {ROLES.map((role) => (
          <article key={role.title} className={styles.topic}>
            <h4>{role.title}</h4>
            <ul className={styles.list}>
              {role.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section className={styles.section} id="checklist-diario">
        <h3>Checklist operativo diario</h3>
        <ul className={styles.list}>
          {DAILY_CHECKLIST.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
