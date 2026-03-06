// Página del módulo ayuda.
import Link from "next/link";
import { MANUALS } from "../manuals";
import styles from "../ayuda.module.css";

export default function ChecklistCapturasPage() {
  return (
    <div className={styles.root}>
      <section className={styles.hero}>
        <h2>Checklist de capturas</h2>
        <p>Guía para producir las capturas reales de cada bloque de manual.</p>
        <span className={styles.inlineGroup}>
          <Link href="/ayuda" className={styles.inlineLink}>Volver a manuales</Link>
        </span>
      </section>

      <section className={styles.section}>
        <h3>Reglas generales</h3>
        <ol className={styles.steps}>
          <li>Usar resolución homogénea (recomendado 1280x720).</li>
          <li>Mostrar siempre menú/pestaña activa y contenido principal.</li>
          <li>Evitar datos sensibles reales; usar datos de demo.</li>
          <li>Reemplazar archivo manteniendo el nombre de ruta exacto.</li>
          <li>Validar legibilidad y coherencia con el texto del bloque.</li>
        </ol>
      </section>

      <section className={styles.section}>
        <h3>Capturas por manual</h3>
        {MANUALS.map((manual) => (
          <article key={manual.slug} className={styles.card}>
            <h4>{manual.title}</h4>
            <ul className={styles.list}>
              {manual.blocks.map((block) => (
                <li key={block.id}>
                  <strong>{block.title}</strong>: <code>{block.screenshot.src}</code>
                </li>
              ))}
            </ul>
            <span className={styles.inlineGroup}>
              <Link href={`/ayuda/${manual.slug}`} className={styles.inlineLink}>Abrir manual</Link>
              <Link href={manual.targetPath} className={styles.inlineLink}>Ir al módulo</Link>
            </span>
          </article>
        ))}
      </section>
    </div>
  );
}
