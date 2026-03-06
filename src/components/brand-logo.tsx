"use client";
// Componente de UI: brand-logo.

import Image from "next/image";
import { useMemo, useState } from "react";

type Props = {
  kind: "full" | "isotype";
  theme: "light" | "dark";
  className?: string;
  alt?: string;
};

const SOURCES = {
  full: {
    light: ["/brand/rentiq-logo-light.svg", "/brand/rentiq-logo-light.png"],
    dark: ["/brand/rentiq-logo-dark.svg", "/brand/rentiq-logo-dark.png"],
  },
  isotype: {
    light: ["/brand/rentiq-isotipo.svg", "/brand/rentiq-isotipo.png"],
    dark: ["/brand/rentiq-isotipo.svg", "/brand/rentiq-isotipo.png"],
  },
} as const;

export function BrandLogo({ kind, theme, className, alt = "RentIQ" }: Props) {
  const candidates = useMemo(() => SOURCES[kind][theme], [kind, theme]);
  const [index, setIndex] = useState(0);

  if (index >= candidates.length) {
    return <span className={`${className ?? ""} brand-logo-missing`}>{alt}</span>;
  }

  return (
    <Image
      src={candidates[index]}
      alt={alt}
      className={className}
      width={240}
      height={90}
      onError={() => setIndex((current) => current + 1)}
      priority
      unoptimized
    />
  );
}
