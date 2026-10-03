import { getAccount } from "../auth/auth.server";

import type { Role } from "./roles";

// Reload assignments on every request: no role claims in cookies or auth caches.
export async function getAccess(request: Request, env: Env) {
  const account = await getAccount(request, env);
  if (!account?.emailVerified)
    throw new Response("Silakan masuk terlebih dahulu.", { status: 401 });
  const results = await env.DB.batch<Record<string, unknown>>([
    env.DB.prepare("SELECT role FROM role_assignment WHERE user_id = ?").bind(account.id),
    env.DB.prepare("SELECT status, house FROM alumni_membership WHERE user_id = ?").bind(
      account.id
    ),
    env.DB.prepare(
      "SELECT primary_user_id FROM organization_bootstrap WHERE primary_user_id = ?"
    ).bind(account.id),
  ]);
  const assignedRoles = results[0].results.map((row) => row.role as Role);
  const membership = results[1].results[0] as
    { status: "approved" | "suspended"; house: string } | undefined;
  const primary = results[2].results.length === 1;
  return {
    account,
    roles: assignedRoles,
    membership: membership ?? { status: "none", house: null },
    permissions: {
      manageRoles: primary,
      audit: primary,
      reviewMembership: assignedRoles.includes("membership-administrator"),
      directory: assignedRoles.includes("directory-coordinator"),
      finance: assignedRoles.includes("finance-coordinator"),
      validateSchoolContent: assignedRoles.includes("staff"),
      proposeStudentContent: assignedRoles.includes("student"),
      endorse: membership?.status === "approved",
    },
  };
}

export async function requirePrimary(request: Request, env: Env) {
  const access = await getAccess(request, env);
  if (!access.permissions.manageRoles)
    throw new Response("Akses tidak diizinkan.", { status: 403 });
  return access;
}
