import { getAccount } from "../auth/auth.server";

import { authorizationRepository } from "../db/authorization.repository.server";

// Reload assignments on every request: no role claims in cookies or auth caches.
export async function getAccess(request: Request, env: Env) {
  const account = await getAccount(request, env);
  if (!account?.emailVerified)
    throw new Response("Silakan masuk terlebih dahulu.", { status: 401 });
  const {
    roles: assignedRoles,
    membership,
    primary,
  } = await authorizationRepository(env.DB).currentAccess(account.id);
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

export async function requireReviewer(request: Request, env: Env) {
  const access = await getAccess(request, env);
  if (!access.permissions.reviewMembership)
    throw new Response("Akses tidak diizinkan.", { status: 403 });
  return access;
}

export async function requireDirectory(request: Request, env: Env) {
  const access = await getAccess(request, env);
  if (!access.permissions.directory) throw new Response("Akses tidak diizinkan.", { status: 403 });
  return access;
}
