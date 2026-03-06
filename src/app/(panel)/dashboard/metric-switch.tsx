"use client";
// Módulo metric-switch.tsx.

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Props = {
  metric: "entregas" | "reservas";
  className: string;
  activeClassName: string;
};

const STORAGE_KEY = "dashboard_metric";

export function MetricSwitch({ metric, className, activeClassName }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  useEffect(() => {
    const hasMetric = params.get("metric");
    const stored = typeof window !== "undefined" ? window.sessionStorage.getItem(STORAGE_KEY) : null;
    if (!hasMetric && stored && (stored === "entregas" || stored === "reservas")) {
      const next = new URLSearchParams(params.toString());
      next.set("metric", stored);
      router.replace(`${pathname}?${next.toString()}`);
      return;
    }
    if (metric) {
      window.sessionStorage.setItem(STORAGE_KEY, metric);
    }
  }, [metric, params, pathname, router]);

  function switchMetric(nextMetric: "entregas" | "reservas") {
    const next = new URLSearchParams(params.toString());
    next.set("metric", nextMetric);
    window.sessionStorage.setItem(STORAGE_KEY, nextMetric);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => switchMetric("entregas")}
        className={metric === "entregas" ? `${className} ${activeClassName}` : className}
        style={{ color: "var(--color-text-primary)" }}
      >
        Entregas
      </button>
      <button
        type="button"
        onClick={() => switchMetric("reservas")}
        className={metric === "reservas" ? `${className} ${activeClassName}` : className}
        style={{ color: "var(--color-text-primary)" }}
      >
        Reservas
      </button>
    </>
  );
}
