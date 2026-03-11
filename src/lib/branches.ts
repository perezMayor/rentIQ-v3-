export type BranchId = string;

export const DEFAULT_BRANCH_ID = "";

export function normalizeBranchId(value: string): BranchId {
  return value.trim().toUpperCase();
}

export function isBranchId(value: string): value is BranchId {
  return normalizeBranchId(value).length > 0;
}
