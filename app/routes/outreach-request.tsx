import { env } from "cloudflare:workers";
import { Form, Link, data, useNavigation, type ShouldRevalidateFunctionArgs } from "react-router";
import type { Route } from "./+types/outreach-request";
import {
  giveConsent,
  readOutreachRequest,
  respondOutreach,
  withdrawConsent,
} from "../outreach/outreach.server";
import { NeedDetails } from "../outreach/need-details";
import { invalidationReasonLabels, outreachStatusLabels } from "../outreach/model";
import { pageTitle } from "../content/page-title";
export function meta() {
  return [{ title: pageTitle("Tanggapi permintaan bantuan") }];
}
// Conflicts mean the displayed consent details or delivery state may be stale.
export function shouldRevalidate({
  actionStatus,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  return actionStatus === 409 || defaultShouldRevalidate;
}
export async function loader({ request, params }: Route.LoaderArgs) {
  return readOutreachRequest(request, env, params.requestId);
}
export async function action({ request, params }: Route.ActionArgs) {
  const f = await request.formData();
  const intent = f.get("intent");
  try {
    if (intent === "consent") {
      const result = await giveConsent(request, env, params.requestId, {
        consent: f.get("consent") === "true",
        expectedStaffUserId: f.get("expectedStaffUserId"),
        expectedMemberEmail: f.get("expectedMemberEmail"),
      });
      return {
        error: null,
        message: result.shared
          ? "Persetujuan tercatat. Perkenalan telah dikirim kepada kontak staf."
          : "Persetujuan tercatat. Pengiriman perkenalan menunggu.",
      };
    }
    if (intent === "withdraw-consent") {
      await withdrawConsent(request, env, params.requestId, {});
      return {
        error: null,
        message: "Persetujuan ditarik. Email belum dibagikan dan tidak akan dikirim.",
      };
    }
    await respondOutreach(request, env, params.requestId, {
      outcome: f.get("outcome"),
      reason: f.get("outcome") === "declined" ? (f.get("reason") ?? "") : "",
    });
    return { error: null, message: null };
  } catch (e) {
    if (!(e instanceof Response) || ![400, 403, 404, 409].includes(e.status)) throw e;
    return data({ error: await e.text(), message: null }, { status: e.status });
  }
}
export default function OutreachRequest({ loaderData: d, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== "idle";
  const active = d.sharing.find(
    (item) => !item.sharedAt && !item.withdrawnAt && !item.invalidatedAt
  );
  const shared = d.sharing.filter((item) => !!item.sharedAt);
  const latestInactive = d.sharing.find((item) => item.withdrawnAt || item.invalidatedAt);
  const staffName = d.staffRecipient?.name ?? d.need.staffContactName;
  return (
    <main className="mx-auto max-w-3xl space-y-6 break-words">
      <Link to="/outreach">← Permintaan bantuan</Link>
      <h1>{d.need.title}</h1>
      <p role="status">{outreachStatusLabels[d.request.status]}</p>
      <NeedDetails need={{ ...d.need, staffContactName: staffName }} />
      <p>Batas respons (UTC): {d.request.expiresAt}</p>
      <p>Menyatakan minat tidak membagikan email Anda.</p>
      <p>Penolakan dan alasannya hanya dilihat koordinator direktori.</p>
      {actionData?.error && <p role="alert">{actionData.error}</p>}
      {actionData?.message && <p role="status">{actionData.message}</p>}
      {d.viewer.isRecipient && d.access.canRespond && (
        <Form method="post" className="space-y-4">
          <label className="block">
            Alasan penolakan (opsional)
            <textarea name="reason" maxLength={1000} rows={3} />
          </label>
          <div className="flex flex-wrap gap-3">
            <button name="outcome" value="interested" disabled={busy}>
              Saya berminat
            </button>
            <button name="outcome" value="declined" disabled={busy}>
              Tolak permintaan
            </button>
          </div>
        </Form>
      )}
      {d.viewer.isRecipient && d.request.status === "interested" && (
        <section aria-label="Persetujuan berbagi email" className="space-y-3 rounded border p-4">
          <h2 className="text-xl font-semibold">Persetujuan berbagi email</h2>
          <p>Kontak staf penerima perkenalan: {staffName}</p>
          {active && (
            <>
              <p role="status">
                Persetujuan tercatat pada {active.consentedAt} untuk {active.staffName}.
              </p>
              {d.access.canWithdraw && (
                <Form method="post" className="space-y-2">
                  <input type="hidden" name="intent" value="withdraw-consent" />
                  <p>
                    Anda dapat menarik persetujuan ini sebelum email dikirim. Email yang sudah
                    dibagikan tidak dapat ditarik kembali.
                  </p>
                  <button disabled={busy}>Tarik persetujuan</button>
                </Form>
              )}
              {!d.staffRecipient?.active && (
                <p>
                  Perkenalan dijeda karena kontak staf tidak lagi memiliki peran staf terverifikasi.
                </p>
              )}
            </>
          )}
          {d.access.canConsent && (
            <Form
              key={`${d.staffRecipient?.userId}:${d.viewer.email}`}
              method="post"
              className="space-y-3"
            >
              <input type="hidden" name="intent" value="consent" />
              <input type="hidden" name="expectedStaffUserId" value={d.staffRecipient?.userId} />
              <input type="hidden" name="expectedMemberEmail" value={d.viewer.email ?? ""} />
              <label className="flex items-start gap-2">
                <input type="checkbox" name="consent" value="true" required />
                <span>
                  Saya setuju email saya ({d.viewer.email}) dibagikan kepada {staffName} untuk
                  perkenalan ini.
                </span>
              </label>
              <p>
                Persetujuan dapat ditarik sebelum email dikirim. Setelah email dikirim, email tidak
                dapat ditarik kembali.
              </p>
              <button disabled={busy}>Setujui perkenalan</button>
            </Form>
          )}
          {shared.map((item) => (
            <p key={item.id}>
              Email Anda sudah dibagikan kepada {item.staffName} pada {item.sharedAt}. Email yang
              sudah dibagikan tidak dapat ditarik kembali.
            </p>
          ))}
          {latestInactive && (
            <p>
              Persetujuan sebelumnya {latestInactive.withdrawnAt ? "ditarik" : "dibatalkan"}:{" "}
              {latestInactive.invalidationReason
                ? (invalidationReasonLabels[latestInactive.invalidationReason] ??
                  latestInactive.invalidationReason)
                : "tidak berlaku lagi"}
              .
            </p>
          )}
          {d.access.expired && !active && !shared.length && (
            <p>
              Batas respons telah lewat. Tidak ada perkenalan yang dikirim karena persetujuan tidak
              diberikan sebelum batas respons.
            </p>
          )}
          {!d.eligible && !active && !shared.length && (
            <p>Profil atau keanggotaan Anda belum memenuhi syarat untuk perkenalan ini.</p>
          )}
          {!d.staffRecipient?.active && !active && !shared.length && (
            <p>Perkenalan belum dapat dilakukan karena kontak staf tidak aktif.</p>
          )}
        </section>
      )}
    </main>
  );
}
