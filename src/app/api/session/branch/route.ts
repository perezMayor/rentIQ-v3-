// Endpoint HTTP de session/branch.
import { NextResponse } from "next/server";
import { BRANCH_COOKIE, requireSessionUser } from "@/lib/auth";
import { DEFAULT_BRANCH_ID, normalizeBranchId } from "@/lib/branches";
import { getCompanySettings } from "@/lib/services/rental-service";

export async function POST(request: Request) {
  try {
    await requireSessionUser();
  } catch {
    return NextResponse.json({ ok: false, error: "NO_AUTH" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { branch?: string };
  const branch = normalizeBranchId(typeof body.branch === "string" ? body.branch : "");
  const settings = await getCompanySettings();
  const validBranches = settings.branches.map((item) => normalizeBranchId(item.code));

  if (!branch || !validBranches.includes(branch)) {
    return NextResponse.json({ ok: false, error: "INVALID_BRANCH" }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true, branch });
  response.headers.set("Set-Cookie", `${BRANCH_COOKIE}=${branch || DEFAULT_BRANCH_ID}; Path=/; Max-Age=28800; SameSite=Lax`);
  return response;
}
