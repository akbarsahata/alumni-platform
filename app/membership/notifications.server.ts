import { sendEmail } from "../email/email.server";

const subjects = {
  submitted: "Pengajuan keanggotaan diterima",
  approved: "Keanggotaan alumni disetujui",
  rejected: "Pengajuan keanggotaan ditolak",
  "action-required": "Perbaikan pengajuan diperlukan",
};

export async function captureNotifications(env: Env, userId: string) {
  const pending = await env.DB.prepare(
    `SELECT id,to_email AS email,kind,message
    FROM membership_notification WHERE user_id = ? AND delivered_at IS NULL ORDER BY rowid`
  )
    .bind(userId)
    .all<{ id: string; email: string; kind: keyof typeof subjects; message: string }>();
  for (const message of pending.results) {
    try {
      await sendEmail(env, {
        to: message.email,
        subject: subjects[message.kind],
        text: `${message.message}\nLihat pengajuan Anda: ${new URL("/membership", env.BETTER_AUTH_URL).href}`,
      });
      await env.DB.prepare(
        `UPDATE membership_notification SET delivered_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
      )
        .bind(message.id)
        .run();
    } catch {
      // The committed decision stays valid. A mutation retry can retry capture.
      return { notificationPending: true };
    }
  }
  return { notificationPending: false };
}
