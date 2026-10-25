import { env } from "cloudflare:workers";
import {
  Form,
  Link,
  data,
  useNavigation,
  useSearchParams,
  type ShouldRevalidateFunctionArgs,
} from "react-router";
import type { Route } from "./+types/outreach-need";
import {
  readOutreachNeed,
  sendOutreach,
  closeOutreachNeed,
  takeOverOutreach,
  remindOutreach,
  deliverOutreach,
  changeStaffRecipient,
  retryIntroduction,
  recordOutreachOutcome,
} from "../outreach/outreach.server";
import { searchDirectory } from "../profiles/directory.server";
import {
  invalidationReasonLabels,
  outcomeStateLabels,
  outreachStatusLabels,
  type OutcomeState,
} from "../outreach/model";
import { NeedDetails } from "../outreach/need-details";
import { OutcomeStateSelect, OutcomeSummary } from "../outreach/outcome-summary";
import { pageTitle } from "../content/page-title";
import { LocalTimestamp } from "../components/local-timestamp";
export function meta() {
  return [{ title: pageTitle("Penjangkauan sekolah") }];
}
export function shouldRevalidate({
  actionStatus,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  return actionStatus === 409 || defaultShouldRevalidate;
}
export async function loader({ request, params }: Route.LoaderArgs) {
  const detail = await readOutreachNeed(request, env, params.needId);
  return { ...detail, directory: detail.canSend ? await searchDirectory(request, env) : null };
}
export async function action({ request, params }: Route.ActionArgs) {
  const f = await request.formData();
  const intent = f.get("intent");
  const requestId = String(f.get("requestId") ?? "");
  const submittedOutcome =
    intent === "record-outcome"
      ? {
          requestId,
          state: String(f.get("state") ?? ""),
          note: String(f.get("note") ?? ""),
        }
      : null;
  try {
    let result: {
      notificationPending?: boolean;
      shared?: boolean;
      pending?: boolean;
      attention?: boolean;
    } = {};
    let message = "Status penjangkauan diperbarui.";
    if (intent === "send") {
      result = await sendOutreach(request, env, params.needId, {
        expectedVersion: f.get("expectedVersion"),
        recipientUserId: f.get("recipientUserId"),
      });
      message = "Permintaan berhasil dikirim.";
    } else if (intent === "close") await closeOutreachNeed(request, env, params.needId, {});
    else if (intent === "change-staff") {
      await changeStaffRecipient(request, env, params.needId, {
        expectedStaffUserId: f.get("expectedStaffUserId"),
        staffUserId: f.get("staffUserId"),
      });
      message =
        "Kontak staf penerima perkenalan diperbarui. Persetujuan yang belum terkirim dibatalkan.";
    } else {
      const detail = await readOutreachNeed(request, env, params.needId);
      if (!detail.requests.some((r) => r.id === requestId))
        throw new Response("Permintaan tidak ditemukan.", { status: 404 });
      if (intent === "take-over")
        await takeOverOutreach(request, env, requestId, {
          expectedCoordinatorUserId: f.get("expectedCoordinatorUserId"),
        });
      else if (intent === "remind") result = await remindOutreach(request, env, requestId, {});
      else if (intent === "deliver") result = await deliverOutreach(request, env, requestId);
      else if (intent === "deliver-introduction") {
        result = await retryIntroduction(request, env, requestId, {});
        message = result.shared
          ? "Perkenalan terkirim."
          : result.attention
            ? "Pengiriman perkenalan memerlukan pemeriksaan operator sebelum dicoba lagi."
            : result.pending
              ? "Perkenalan masih menunggu pengiriman."
              : "Tidak ada persetujuan yang menunggu pengiriman.";
      } else if (intent === "record-outcome") {
        const outcome = await recordOutreachOutcome(request, env, requestId, {
          action: "record",
          expectedRevision: f.get("expectedRevision"),
          state: f.get("state"),
          note: f.get("note"),
        });
        message = `Hasil bantuan dicatat: ${outcomeStateLabels[outcome.state]}.`;
      } else throw new Response("Tindakan tidak valid.", { status: 400 });
    }
    return {
      error: null,
      message: result.notificationPending
        ? "Permintaan tersimpan. Notifikasi menunggu pengiriman."
        : message,
      values: null,
    };
  } catch (e) {
    if (!(e instanceof Response) || ![400, 403, 404, 409].includes(e.status)) throw e;
    return data(
      { error: await e.text(), message: null, values: submittedOutcome },
      { status: e.status }
    );
  }
}
export default function OutreachNeed({ loaderData: d, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== "idle";
  const [params] = useSearchParams();
  const next = new URLSearchParams(params);
  if (d.directory?.nextCursor) next.set("cursor", d.directory.nextCursor);
  return (
    <main className="mx-auto max-w-4xl space-y-6 break-words">
      <Link to="/outreach">← Permintaan bantuan</Link>
      <h1>{d.need.title}</h1>
      <NeedDetails
        need={{ ...d.need, staffContactName: d.staffRecipient?.name ?? d.need.staffContactName }}
      />
      {actionData?.error && <p role="alert">{actionData.error}</p>}
      {actionData?.message && <p role="status">{actionData.message}</p>}
      <section
        aria-label="Kontak staf penerima perkenalan"
        className="space-y-3 rounded border p-4"
      >
        <h2 className="text-xl font-semibold">Kontak staf penerima perkenalan</h2>
        <p>
          Saat ini: {d.staffRecipient?.name ?? d.need.staffContactName}{" "}
          {d.staffRecipient?.active ? "(aktif)" : "(tidak lagi memiliki peran staf terverifikasi)"}
        </p>
        {d.canChangeStaff && (
          <Form method="post" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="intent" value="change-staff" />
            <input
              type="hidden"
              name="expectedStaffUserId"
              value={d.staffRecipient?.userId ?? d.need.staffContactUserId}
            />
            <label>
              Ganti kontak staf penerima
              <select name="staffUserId" required defaultValue="">
                <option value="">Pilih kontak staf</option>
                {d.staffContacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={busy}>
              Simpan kontak penerima
            </button>
          </Form>
        )}
        {d.canChangeStaff && (
          <p>
            Mengganti kontak membatalkan persetujuan yang belum terkirim dan mewajibkan persetujuan
            baru dari alumni. Persetujuan yang sudah terkirim tidak dapat ditarik.
          </p>
        )}
      </section>
      <p>
        {d.closed ? (
          <>
            Kebutuhan ditutup pada{" "}
            {d.closedAt ? <LocalTimestamp value={d.closedAt} /> : "waktu yang tercatat"}.
          </>
        ) : (
          "Maksimal 10 penerima per kebutuhan dan 3 permintaan baru per alumni dalam 30 hari."
        )}
      </p>
      {!!d.requests.length && (
        <p>
          Rincian yang telah dikirim dibekukan. Untuk perubahan, tutup kebutuhan ini dan ajukan
          kebutuhan pengganti dengan persetujuan baru.
        </p>
      )}
      <section className="space-y-4">
        <h2>Status penerima ({d.requests.length}/10)</h2>
        {d.requests.map((r) => {
          const sharing = d.sharing.filter((item) => item.requestId === r.id);
          const active = sharing.find(
            (item) => !item.sharedAt && !item.withdrawnAt && !item.invalidatedAt
          );
          const shared = sharing.filter((item) => !!item.sharedAt);
          const latestInactive = sharing.find((item) => item.withdrawnAt || item.invalidatedAt);
          const outcome = d.outcomes.find((item) => item.requestId === r.id);
          const submitted = actionData?.values?.requestId === r.id ? actionData.values : null;
          return (
            <article className="rounded border p-4 space-y-2" key={r.id}>
              <p>
                Penerima (ID): <span className="break-all">{r.recipientUserId}</span>
              </p>
              <p>{outreachStatusLabels[r.status]}</p>
              <p>
                Batas respons: <LocalTimestamp value={r.expiresAt} />
              </p>
              {r.declineReason && <p>Alasan penolakan: {r.declineReason}</p>}
              <p>
                Koordinator (ID): <span className="break-all">{r.coordinatorUserId}</span>
              </p>
              <Link to={`/outreach/requests/${r.id}`}>Buka klarifikasi privat</Link>
              {d.notifications
                .filter((n) => n.requestId === r.id)
                .map((n) => (
                  <p key={n.kind}>
                    {n.kind === "request" ? "Notifikasi permintaan" : "Pengingat"}:{" "}
                    {
                      {
                        pending: "Menunggu pengiriman",
                        claimed: "Sedang dikirim",
                        captured: "Terkirim",
                        cancelled: "Dibatalkan",
                      }[n.state]
                    }
                  </p>
                ))}
              {active && (
                <p>
                  Perkenalan: persetujuan tercatat{" "}
                  {active.deliveryState === "pending"
                    ? "dan menunggu pengiriman"
                    : "dan pengiriman sedang berlangsung"}{" "}
                  kepada {active.staffName}.
                </p>
              )}
              {shared.map((item) => (
                <p key={item.id}>
                  Perkenalan: terkirim kepada {item.staffName} pada{" "}
                  {item.sharedAt ? (
                    <>
                      <LocalTimestamp value={item.sharedAt} />.
                    </>
                  ) : (
                    "waktu yang tercatat."
                  )}
                </p>
              ))}
              {!active && !shared.length && latestInactive && (
                <p>
                  Perkenalan: persetujuan {latestInactive.withdrawnAt ? "ditarik" : "dibatalkan"}
                  {latestInactive.invalidationReason
                    ? ` (${invalidationReasonLabels[latestInactive.invalidationReason] ?? latestInactive.invalidationReason})`
                    : ""}
                  .
                </p>
              )}
              {!sharing.length && <p>Perkenalan: belum ada persetujuan.</p>}
              <section aria-label="Hasil bantuan" className="space-y-2">
                <h3 className="text-lg font-semibold">Hasil bantuan</h3>
                {outcome?.current ? (
                  <>
                    <OutcomeSummary
                      outcome={{
                        ...outcome.current,
                        events: outcome.events,
                        latest: outcome.latest,
                      }}
                    />
                    <Form method="post" className="space-y-2">
                      <input type="hidden" name="intent" value="record-outcome" />
                      <input type="hidden" name="requestId" value={r.id} />
                      <input
                        type="hidden"
                        name="expectedRevision"
                        value={outcome.current.revision}
                      />
                      <label className="block" htmlFor={`outcome-state-${r.id}`}>
                        Catat hasil bantuan
                      </label>
                      <OutcomeStateSelect
                        id={`outcome-state-${r.id}`}
                        defaultValue={
                          (submitted?.state as OutcomeState | undefined) || outcome.current.state
                        }
                      />
                      <label className="block" htmlFor={`outcome-note-${r.id}`}>
                        Catatan hasil bantuan (1-500 karakter)
                      </label>
                      <textarea
                        id={`outcome-note-${r.id}`}
                        name="note"
                        required
                        maxLength={500}
                        rows={3}
                        defaultValue={submitted?.note ?? ""}
                      />
                      <p>
                        Catatan ini hanya terlihat oleh alumni penerima dan koordinator direktori.
                        Jangan tulis kontak, alamat rumah, atau isi klarifikasi pribadi.
                      </p>
                      <button type="submit" disabled={busy}>
                        Catat hasil
                      </button>
                    </Form>
                  </>
                ) : (
                  <p>Hasil bantuan dapat dicatat setelah perkenalan terkirim.</p>
                )}
              </section>
              <Form method="post" className="flex flex-wrap gap-3">
                <input type="hidden" name="requestId" value={r.id} />
                <input type="hidden" name="expectedCoordinatorUserId" value={r.coordinatorUserId} />
                {r.coordinatorUserId !== d.actorId && (
                  <button type="submit" name="intent" value="take-over" disabled={busy}>
                    Ambil alih koordinasi
                  </button>
                )}
                {r.status === "pending" &&
                  !r.reminderAt &&
                  Date.parse(r.sentAt) + 7 * 86400000 <= Date.now() && (
                    <button type="submit" name="intent" value="remind" disabled={busy}>
                      Kirim satu pengingat
                    </button>
                  )}
                {r.status === "pending" &&
                  d.notifications.some((n) => n.requestId === r.id && n.state === "pending") && (
                    <button type="submit" name="intent" value="deliver" disabled={busy}>
                      Coba kirim notifikasi
                    </button>
                  )}
                {active &&
                  (active.deliveryState === "pending" ||
                    (active.deliveryAttemptState === "ambiguous" &&
                      !!active.deliveryAttemptStartedAt &&
                      Date.parse(active.deliveryAttemptStartedAt) + 86400000 > Date.now())) && (
                    <button
                      type="submit"
                      name="intent"
                      value="deliver-introduction"
                      disabled={busy}
                    >
                      Coba kirim perkenalan
                    </button>
                  )}
                {active?.deliveryAttemptState === "ambiguous" &&
                  !!active.deliveryAttemptStartedAt &&
                  Date.parse(active.deliveryAttemptStartedAt) + 86400000 <= Date.now() && (
                    <p>
                      Pengiriman perkenalan melewati batas aman idempotensi dan menunggu pemeriksaan
                      operator.
                    </p>
                  )}
              </Form>
            </article>
          );
        })}
      </section>
      {!d.closed && (
        <Form method="post" className="space-y-2 rounded border border-dashed p-4">
          <button type="submit" name="intent" value="close" data-variant="cancel" disabled={busy}>
            Tutup kebutuhan
          </button>
          <p>
            Penutupan menghentikan permintaan yang belum dijawab dan pengingat yang masih menunggu.
            Pengaturan yang sudah berjalan dapat berlanjut, dan hasil bantuan tetap dapat dicatat
            atau dikoreksi setelah kebutuhan ditutup.
          </p>
        </Form>
      )}
      {d.canSend && d.requests.length < 10 && d.directory && (
        <section className="space-y-4">
          <h2>Pilih penerima</h2>
          <p>Tinjau keahlian dan pilih satu alumni untuk setiap pengiriman.</p>
          <Form method="get" className="flex flex-wrap items-end gap-3">
            <label>
              Perkenalan profesional
              <input name="introduction" defaultValue={params.get("introduction") ?? ""} />
            </label>
            <label>
              Keahlian
              <select name="expertise" defaultValue={params.get("expertise") ?? ""}>
                <option value="">Semua keahlian</option>
                {d.directory.tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">Cari penerima</button>
          </Form>
          {d.directory.profiles
            .filter((p) => !d.requests.some((r) => r.recipientUserId === p.id))
            .map((p) => (
              <article className="rounded border p-4 space-y-2" key={p.id}>
                <h3>
                  <Link to={`/directory/${p.id}`}>{p.displayName || p.schoolName || "Alumni"}</Link>
                </h3>
                <p>{p.introduction}</p>
                <p>{[...p.city, ...p.country].join(" · ")}</p>
                <Form method="post">
                  <input type="hidden" name="intent" value="send" />
                  <input type="hidden" name="expectedVersion" value={d.need.version} />
                  <input type="hidden" name="recipientUserId" value={p.id} />
                  <button type="submit" disabled={busy}>
                    Kirim permintaan
                  </button>
                </Form>
              </article>
            ))}
          {d.directory.nextCursor && <Link to={`?${next}`}>Penerima berikutnya</Link>}
        </section>
      )}
    </main>
  );
}
