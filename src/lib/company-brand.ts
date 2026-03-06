// Utilidad compartida del dominio RentIQ (company-brand).
import type { CompanySettings } from "@/lib/domain/rental";

export function getDocumentCompanyName(settings: CompanySettings): string {
  const preferred = (settings.documentBrandName ?? "").trim();
  if (preferred) return preferred;
  const company = (settings.companyName ?? "").trim();
  if (company) return company;
  return "N/D";
}

export function getCompanyLogoDataUrl(settings: CompanySettings): string {
  return (settings.logoDataUrl ?? "").trim();
}

export function getCompanyPrimaryColor(settings: CompanySettings): string {
  const color = (settings.brandPrimaryColor ?? "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#2563eb";
}
