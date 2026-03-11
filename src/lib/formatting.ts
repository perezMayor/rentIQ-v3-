export function parseDateSafe(value: string): Date | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function formatDateDisplay(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "N/D";
  const parsed = parseDateSafe(raw);
  if (!parsed) return raw;
  const day = String(parsed.getDate()).padStart(2, "0");
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const year = parsed.getFullYear();
  return `${day}/${month}/${year}`;
}

export function formatDateTimeDisplay(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "N/D";
  const parsed = parseDateSafe(raw);
  if (!parsed) return raw;
  const day = String(parsed.getDate()).padStart(2, "0");
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const year = parsed.getFullYear();
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} · ${hours}:${minutes}`;
}

export function formatMoneyDisplay(value: number): string {
  return `${value.toFixed(2)} €`;
}
