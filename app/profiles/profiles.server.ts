import { getAccess } from "../authorization/permissions.server";
import { profileRepository } from "../db/profile.repository.server";
import { parseInput, profileInput } from "../http/validation";
import { z } from "zod";
import { emptyProfile } from "./model";
export async function readProfile(request: Request, env: Env) {
  const access = await getAccess(request, env);
  // Suspended members retain access to their own profile and current eligibility.
  if (!["approved", "suspended"].includes(access.membership.status))
    throw new Response("Profil tersedia setelah keanggotaan disetujui.", { status: 403 });
  const own = await profileRepository(env.DB).own(access.account.id);
  const profile = own.profile ?? emptyProfile;
  const anniversary = profile.confirmedAt ? new Date(profile.confirmedAt) : null;
  if (anniversary) {
    const month = anniversary.getUTCMonth();
    anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 1);
    // Clamp February 29 to February 28 in a non-leap anniversary year.
    if (anniversary.getUTCMonth() !== month) anniversary.setUTCDate(0);
  }
  const reason =
    access.membership.status !== "approved"
      ? "membership"
      : !profile.participation
        ? "participation"
        : profile.availability === "unavailable"
          ? "unavailable"
          : !anniversary || Date.now() >= anniversary.getTime()
            ? "stale"
            : !profile.availability || !profile.expertiseTags.length || !profile.helpTypes.length
              ? "incomplete"
              : null;
  return {
    profile,
    identity: { ...own.identity, house: access.membership.house },
    membershipStatus: access.membership.status,
    eligibility: { eligible: reason === null, reason },
  };
}
export async function saveProfile(request: Request, env: Env, input: unknown, confirm = false) {
  const access = await getAccess(request, env);
  if (access.membership.status !== "approved")
    throw new Response("Keanggotaan aktif diperlukan untuk memperbarui profil.", { status: 403 });
  const repository = profileRepository(env.DB);
  const confirmedAt = new Date().toISOString();
  if (confirm) {
    parseInput(z.object({}).strict(), input, "Permintaan konfirmasi tidak valid.");
    const rows = await repository.confirm(access.account.id, confirmedAt);
    if (!rows.length) throw new Response("Simpan profil terlebih dahulu.", { status: 409 });
  } else {
    const { participationConsent: _consent, ...profile } = parseInput(
      profileInput,
      input,
      "Lengkapi pilihan keahlian, bentuk bantuan, ketersediaan, dan persetujuan partisipasi."
    );
    const rows = await repository.save(access.account.id, { ...profile, confirmedAt });
    if (!rows.length)
      throw new Response("Status keanggotaan berubah. Muat ulang profil.", { status: 409 });
  }
  return await readProfile(request, env);
}
