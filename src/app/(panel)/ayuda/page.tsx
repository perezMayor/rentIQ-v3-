// Página del módulo ayuda.
import Link from "next/link";
import { MANUALS } from "./manuals";
import styles from "./ayuda.module.css";

export default function AyudaPage() {
  return (
    <div className={styles.root}>
      <section className={styles.hero}>
        <h2>Manuales de ayuda</h2>
        <p>Selecciona un apartado para ver su manual operativo completo.</p>
        <span className={styles.inlineGroup}>
          <Link href="/ayuda/checklist-capturas" className={styles.inlineLink}>
            Checklist de capturas
          </Link>
        </span>
      </section>

      <section className={styles.section}>
        <h3>Manuales disponibles</h3>
        <div className={styles.cards}>
          {MANUALS.map((manual) => (
            <article key={manual.slug} className={styles.card}>
              <h4>{manual.title}</h4>
              <p>{manual.summary}</p>
              <span className={styles.inlineGroup}>
                <Link href={`/ayuda/${manual.slug}`} className={styles.inlineLink}>
                  Abrir manual
                </Link>
                <Link href={manual.targetPath} className={styles.inlineLink}>
                  Ir al módulo
                </Link>
              </span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
