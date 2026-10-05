import { invitationRepository } from "../db/invitation.repository.server";
import { getAccess, requirePrimary } from "./permissions.server";
import { hasTrustedOrigin } from "../auth/auth.server";
import { invitationInput, invitationAcceptanceInput, parseInput } from "../http/validation";
import { sendEmail } from "../email/email.server";
import { roleLabels } from "./roles";

export async function issueInvitation(request: Request, env: Env, input: unknown) {
  const { account } = await requirePrimary(request, env);
  if (!hasTrustedOrigin(request, env))
    throw new Response("Permintaan tidak diizinkan.", { status: 403 });
  const fields = parseInput(
    invitationInput,
    input,
    "Isi email, peran sekolah, dan alasan yang valid."
  );
  const invitation = await invitationRepository(env.DB).issue({
    ...fields,
    id: crypto.randomUUID().replaceAll("-", ""),
    issuerId: account.id,
  });
  let delivered = true;
  try {
    await sendEmail(env, {
      to: invitation.email,
      subject: "Undangan perwakilan sekolah",
      text: `Anda diundang sebagai ${roleLabels[invitation.role]}. Masuk dengan kode menggunakan email ini, lalu buka ${new URL(`/invitations/${invitation.id}`, env.BETTER_AUTH_URL)} untuk menerima. Undangan berlaku tujuh hari hingga ${invitation.expiresAt}. Tidak perlu pengajuan atau profil alumni.`,
    });
  } catch {
    delivered = false;
  }
  return { id: invitation.id, expiresAt: invitation.expiresAt, delivered };
}

export async function readInvitation(request: Request, env: Env, id: string) {
  const { account } = await getAccess(request, env);
  const invitation = await invitationRepository(env.DB).read(id);
  if (!invitation || invitation.email !== account.email.toLowerCase())
    throw new Response("Undangan tidak tersedia untuk akun ini.", { status: 404 });
  return {
    role: invitation.role,
    expiresAt: invitation.expiresAt,
    accepted: !!invitation.acceptedBy,
    expired: invitation.expiresAt <= new Date().toISOString(),
  };
}

export async function acceptInvitation(request: Request, env: Env, id: string, input: unknown) {
  const { account } = await getAccess(request, env);
  if (!hasTrustedOrigin(request, env))
    throw new Response("Permintaan tidak diizinkan.", { status: 403 });
  await readInvitation(request, env, id);
  parseInput(
    invitationAcceptanceInput,
    input,
    "Undangan hanya memberikan peran yang telah ditentukan."
  );
  if (!(await invitationRepository(env.DB).accept(id, account.id)))
    throw new Response("Undangan sudah digunakan atau kedaluwarsa.", { status: 409 });
  return { accepted: true };
}
