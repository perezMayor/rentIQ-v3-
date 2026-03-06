// Página del módulo ayuda.
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { MANUALS, getManualBySlug } from "../manuals";
import styles from "../ayuda.module.css";

type Props = {
  params: Promise<{ manual: string }>;
};

export function generateStaticParams() {
  return MANUALS.map((manual) => ({ manual: manual.slug }));
}

export default async function ManualDetailPage({ params }: Props) {
  const { manual: slug } = await params;
  const manual = getManualBySlug(slug);

  if (!manual) {
    notFound();
  }

  return (
    <div className={styles.root}>
      <section className={styles.hero}>
        <h2>{manual.title}</h2>
        <p>{manual.summary}</p>
        <span className={styles.inlineGroup}>
          <Link href="/ayuda" className={styles.inlineLink}>Volver a manuales</Link>
          <Link href={manual.targetPath} className={styles.inlineLink}>Ir al módulo</Link>
        </span>
      </section>

      {manual.blocks.map((block, index) => (
        <section key={block.id} className={styles.section} id={block.id}>
          <h3>{index + 1}. {block.title}</h3>
          <p>{block.context}</p>

          <figure className={styles.shotCard}>
            <Image src={block.screenshot.src} alt={block.screenshot.caption} width={1280} height={720} className={styles.shotImage} />
            <figcaption>{block.screenshot.caption}</figcaption>
          </figure>

          <div className={styles.blockContent}>
            <h4>Configuración</h4>
            <ul className={styles.list}>
              {block.setup.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>

            <h4>Uso de menús</h4>
            <ul className={styles.list}>
              {block.menus.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>

            <h4>Paso a paso</h4>
            <ol className={styles.steps}>
              {block.steps.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </div>
        </section>
      ))}
    </div>
  );
}
