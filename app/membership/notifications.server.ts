import { notificationRepository } from "../db/notification.repository.server";
import { sendEmail } from "../email/email.server";

const subjects = {
  submitted: "Pengajuan keanggotaan diterima",
  approved: "Keanggotaan alumni disetujui",
  rejected: "Pengajuan keanggotaan ditolak",
  "action-required": "Perbaikan pengajuan diperlukan",
};

export async function captureNotifications(env: Env, userId: string) {
  const pending = await notificationRepository(env.DB).pending({ userId: userId });
  for (const message of pending) {
    try {
      await sendEmail(env, {
        to: message.email,
        subject: subjects[message.kind],
        text: `${message.message}\nLihat pengajuan Anda: ${new URL("/membership", env.BETTER_AUTH_URL).href}`,
      });
      await notificationRepository(env.DB).markDelivered({ id: message.id });
    } catch {
      // The committed decision stays valid. A mutation retry can retry capture.
      return { notificationPending: true };
    }
  }
  return { notificationPending: false };
}
