import { hasTrustedOrigin } from "../auth/auth.server";
import { emailChangeRepository } from "../db/email-change.repository.server";
import { sendEmail } from "../email/email.server";
import {
  emailChangeInput,
  emailChangeRequestId,
  emailChangeVerificationInput,
  parseInput,
} from "../http/validation";
import { getAccess, requireReviewer } from "./permissions.server";

function token() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function tokenHash(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function emailChangeAccounts(request: Request, env: Env) {
  await requireReviewer(request, env);
  return emailChangeRepository(env.DB).accounts();
}

export async function startEmailChange(request: Request, env: Env, input: unknown) {
  const { account } = await requireReviewer(request, env);
  if (!hasTrustedOrigin(request, env))
    throw new Response("Permintaan tidak diizinkan.", { status: 403 });
  const fields = parseInput(
    emailChangeInput,
    input,
    "Pilih akun dan isi email baru, catatan pemeriksaan identitas, serta alasan yang valid."
  );
  const repository = emailChangeRepository(env.DB);
  const target = await repository.verifiedAccount(fields.targetUserId);
  if (!target) throw new Response("Akun terverifikasi tidak ditemukan.", { status: 400 });
  if (account.id === target.id)
    throw new Response("Administrator lain harus membantu perubahan email ini.", { status: 403 });
  const newEmail = fields.newEmail.toLowerCase();
  if (
    newEmail === target.email.toLowerCase() ||
    (await repository.addressInUse(newEmail, target.id))
  )
    throw new Response("Alamat email baru sudah digunakan atau tidak berbeda.", { status: 409 });

  const verificationToken = token();
  let emailChange;
  try {
    emailChange = await repository.issue({
      id: crypto.randomUUID().replaceAll("-", ""),
      targetUserId: target.id,
      actorUserId: account.id,
      oldEmail: target.email.toLowerCase(),
      newEmail,
      identityCheck: fields.identityCheck,
      reason: fields.reason,
      tokenHash: await tokenHash(verificationToken),
    });
  } catch (error) {
    if (await repository.addressInUse(newEmail, target.id))
      throw new Response("Alamat email baru sudah digunakan.", { status: 409 });
    throw error;
  }

  let delivered = true;
  try {
    await sendEmail(env, {
      to: newEmail,
      subject: "Verifikasi perubahan email akun alumni",
      text: `Kode verifikasi perubahan email: ${verificationToken}. Buka ${new URL(`/email-changes/${emailChange.id}`, env.BETTER_AUTH_URL)} setelah masuk menggunakan email akun saat ini. Kode berlaku hingga ${emailChange.expiresAt}. Jangan bagikan kode ini.`,
    });
  } catch {
    delivered = false;
  }
  return { id: emailChange.id, expiresAt: emailChange.expiresAt, delivered };
}

export async function readEmailChange(request: Request, env: Env, id: string) {
  const { account } = await getAccess(request, env);
  const requestId = parseInput(emailChangeRequestId, id, "Permintaan verifikasi tidak tersedia.");
  const repository = emailChangeRepository(env.DB);
  const change = await repository.request(requestId);
  if (!change || change.targetUserId !== account.id)
    throw new Response("Permintaan verifikasi tidak tersedia.", { status: 404 });
  const expired = change.status === "pending" && change.expiresAt <= new Date().toISOString();
  if (expired) await repository.expire({ id: change.id, targetUserId: account.id });
  return {
    email: change.newEmail,
    expiresAt: change.expiresAt,
    expired: expired || change.status === "expired",
    completed: change.status === "completed",
  };
}

export async function verifyEmailChange(request: Request, env: Env, id: string, input: unknown) {
  const { account } = await getAccess(request, env);
  if (!hasTrustedOrigin(request, env))
    throw new Response("Permintaan tidak diizinkan.", { status: 403 });
  const requestId = parseInput(emailChangeRequestId, id, "Permintaan verifikasi tidak tersedia.");
  const { token: verificationToken } = parseInput(
    emailChangeVerificationInput,
    input,
    "Masukkan kode verifikasi yang valid."
  );
  const repository = emailChangeRepository(env.DB);
  const change = await repository.request(requestId);
  if (!change || change.targetUserId !== account.id)
    throw new Response("Permintaan verifikasi tidak tersedia.", { status: 404 });
  if (change.status !== "pending")
    throw new Response("Kode verifikasi tidak berlaku atau sudah digunakan.", { status: 409 });
  if (change.expiresAt <= new Date().toISOString()) {
    await repository.expire({ id: change.id, targetUserId: account.id });
    throw new Response("Kode verifikasi sudah kedaluwarsa.", { status: 409 });
  }
  const hashedToken = await tokenHash(verificationToken);
  if (await repository.collide({ id: change.id, targetUserId: account.id, tokenHash: hashedToken }))
    throw new Response("Kode verifikasi tidak berlaku. Hubungi administrator.", { status: 409 });
  if (
    !(await repository.complete({
      id: change.id,
      targetUserId: account.id,
      tokenHash: hashedToken,
    }))
  )
    throw new Response("Kode verifikasi tidak berlaku atau sudah digunakan.", { status: 409 });
  return { changed: true };
}
