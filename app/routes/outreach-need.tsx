import { env } from "cloudflare:workers";
import { Form, Link, data, useNavigation, useSearchParams } from "react-router";
import type { Route } from "./+types/outreach-need";
import {
  readOutreachNeed,
  sendOutreach,
  closeOutreachNeed,
  takeOverOutreach,
  remindOutreach,
  deliverOutreach,
} from "../outreach/outreach.server";
import { searchDirectory } from "../profiles/directory.server";
import { outreachStatusLabels } from "../outreach/model";
import { NeedDetails } from "../outreach/need-details";
import { pageTitle } from "../content/page-title";
export function meta() {
  return [{ title: pageTitle("Penjangkauan sekolah") }];
}
export async function loader({ request, params }: Route.LoaderArgs) {
  const detail = await readOutreachNeed(request, env, params.needId);
  return { ...detail, directory: detail.canSend ? await searchDirectory(request, env) : null };
}
export async function action({ request, params }: Route.ActionArgs) {
  const f = await request.formData();
  const intent = f.get("intent");
  const requestId = String(f.get("requestId") ?? "");
  try {
    let result: { notificationPending?: boolean } = {};
    let message = "Status penjangkauan diperbarui.";
    if (intent === "send") {
      result = await sendOutreach(request, env, params.needId, {
        expectedVersion: f.get("expectedVersion"),
        recipientUserId: f.get("recipientUserId"),
      });
      message = "Permintaan berhasil dikirim.";
    } else if (intent === "close") await closeOutreachNeed(request, env, params.needId, {});
    else {
      const detail = await readOutreachNeed(request, env, params.needId);
      if (!detail.requests.some((r) => r.id === requestId))
        throw new Response("Permintaan tidak ditemukan.", { status: 404 });
      if (intent === "take-over")
        await takeOverOutreach(request, env, requestId, {
          expectedCoordinatorUserId: f.get("expectedCoordinatorUserId"),
        });
      else if (intent === "remind") result = await remindOutreach(request, env, requestId, {});
      else if (intent === "deliver") result = await deliverOutreach(request, env, requestId);
      else throw new Response("Tindakan tidak valid.", { status: 400 });
    }
    return {
      error: null,
      message: result.notificationPending
        ? "Permintaan tersimpan. Notifikasi menunggu pengiriman."
        : message,
    };
  } catch (e) {
    if (!(e instanceof Response) || ![400, 403, 404, 409].includes(e.status)) throw e;
    return data({ error: await e.text(), message: null }, { status: e.status });
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
      <NeedDetails need={d.need} />
      {actionData?.error && <p role="alert">{actionData.error}</p>}
      {actionData?.message && <p role="status">{actionData.message}</p>}
      <p>
        {d.closed
          ? "Kebutuhan ditutup."
          : "Maksimal 10 penerima per kebutuhan dan 3 permintaan baru per alumni dalam 30 hari."}
      </p>
      {!!d.requests.length && (
        <p>
          Rincian yang telah dikirim dibekukan. Untuk perubahan, tutup kebutuhan ini dan ajukan
          kebutuhan pengganti dengan persetujuan baru.
        </p>
      )}
      <section className="space-y-4">
        <h2>Status penerima ({d.requests.length}/10)</h2>
        {d.requests.map((r) => (
          <article className="rounded border p-4 space-y-2" key={r.id}>
            <p>
              Penerima (ID): <span className="break-all">{r.recipientUserId}</span>
            </p>
            <p>{outreachStatusLabels[r.status]}</p>
            <p>Batas respons (UTC): {r.expiresAt}</p>
            {r.declineReason && <p>Alasan penolakan: {r.declineReason}</p>}
            <p>
              Koordinator (ID): <span className="break-all">{r.coordinatorUserId}</span>
            </p>
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
            <Form method="post" className="flex flex-wrap gap-3">
              <input type="hidden" name="requestId" value={r.id} />
              <input type="hidden" name="expectedCoordinatorUserId" value={r.coordinatorUserId} />
              {r.coordinatorUserId !== d.actorId && (
                <button name="intent" value="take-over" disabled={busy}>
                  Ambil alih koordinasi
                </button>
              )}
              {r.status === "pending" &&
                !r.reminderAt &&
                Date.parse(r.sentAt) + 7 * 86400000 <= Date.now() && (
                  <button name="intent" value="remind" disabled={busy}>
                    Kirim satu pengingat
                  </button>
                )}
              {r.status === "pending" &&
                d.notifications.some((n) => n.requestId === r.id && n.state === "pending") && (
                  <button name="intent" value="deliver" disabled={busy}>
                    Coba kirim notifikasi
                  </button>
                )}
            </Form>
          </article>
        ))}
      </section>
      {!d.closed && (
        <Form method="post">
          <button name="intent" value="close" disabled={busy}>
            Tutup kebutuhan
          </button>
          <p>
            Penutupan membatalkan permintaan yang belum dijawab dan mempertahankan riwayat respons.
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
            <button>Cari penerima</button>
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
                  <button disabled={busy}>Kirim permintaan</button>
                </Form>
              </article>
            ))}
          {d.directory.nextCursor && <Link to={`?${next}`}>Penerima berikutnya</Link>}
        </section>
      )}
    </main>
  );
}
