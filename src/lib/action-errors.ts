import { redirect } from "next/navigation";

export function isNextRedirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export function getActionErrorMessage(error: unknown, fallback: string): string {
  if (isNextRedirectError(error)) {
    throw error;
  }
  return error instanceof Error ? error.message : fallback;
}

export function redirectWithActionError(input: {
  basePath: string;
  params?: Record<string, string>;
  error: unknown;
  fallback: string;
}): never {
  const query = new URLSearchParams(input.params ?? {});
  query.set("error", getActionErrorMessage(input.error, input.fallback));
  const path = query.toString() ? `${input.basePath}?${query.toString()}` : `${input.basePath}?error=${encodeURIComponent(input.fallback)}`;
  redirect(path);
}

