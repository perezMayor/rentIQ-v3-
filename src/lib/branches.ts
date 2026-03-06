// Utilidad compartida del dominio RentIQ (branches).
export const BRANCHES = [
  { id: "principal", label: "Sucursal" },
  { id: "norte", label: "Sucursal Norte" },
  { id: "sur", label: "Sucursal Sur" },
] as const;

export type BranchId = (typeof BRANCHES)[number]["id"];

export function isBranchId(value: string): value is BranchId {
  return BRANCHES.some((branch) => branch.id === value);
}

export const DEFAULT_BRANCH_ID: BranchId = "principal";
