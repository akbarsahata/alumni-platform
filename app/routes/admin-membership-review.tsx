import { decideMembershipStatus } from "../membership/suspensions.server";
import { pageTitle } from "../content/page-title";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { env } from "cloudflare:workers";
import { useState } from "react";
import { Form, Link, data, useNavigation } from "react-router";
import type { Route } from "./+types/admin-membership-review";
import {
  requireReviewer,
  reviewDetails,
  decideApplication,
  correctApprovedHouse,
} from "../membership/applications.server";
import { houses, statusLabels } from "../membership/model";
import { RevisionView } from "../membership/revision-view";

export function meta() {
  return [{ title: pageTitle("Tinjauan pengajuan") }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { account } = await requireReviewer(request, env);
  return {
    ...(await reviewDetails(request, env, params.userId)),
    self: account.id === params.userId,
    accountId: account.id,
  };
}
export async function action({ request, params }: Route.ActionArgs) {
  await requireReviewer(request, env);
  const form = await request.formData();
  try {
    const result = await (
      form.get("intent") === "status"
        ? decideMembershipStatus
        : form.get("intent") === "house-correction"
          ? correctApprovedHouse
          : decideApplication
    )(request, env, params.userId, Object.fromEntries(form));
    return {
      error: null,
      message: result.notificationPending
        ? "Keputusan tersimpan. Pemberitahuan email menunggu pengiriman."
        : "Keputusan tersimpan. Pemohon telah diberi tahu.",
    };
  } catch (error) {
    if (!(error instanceof Response) || ![400, 409].includes(error.status)) throw error;
    return data({ error: await error.text(), message: null }, { status: error.status });
  }
}

function DecisionForm({
  revision,
  correction = false,
}: {
  revision: number;
  correction?: boolean;
}) {
  const [outcome, setOutcome] = useState("approved");
  const busy = useNavigation().state !== "idle";
  return (
    <Form method="post" className="space-y-4">
      <Input type="hidden" name="expectedRevision" value={revision} />
      {correction && (
        <>
          <Input type="hidden" name="intent" value="house-correction" />
          <label htmlFor="corrected-house">House yang benar</label>
          <select id="corrected-house" name="house" required defaultValue="">
            <option value="" disabled>
              Pilih satu house
            </option>
            {houses.map((house) => (
              <option key={house}>{house}</option>
            ))}
          </select>
          <p>
            Catat pemeriksaan baru terhadap house yang benar. Koreksi dan persetujuan baru disimpan
            bersama; dukungan lama tidak dipakai.
          </p>
        </>
      )}
      {!correction && (
        <div>
          <label htmlFor="review-outcome">Keputusan</label>
          <select
            id="review-outcome"
            name="outcome"
            value={outcome}
            onChange={(event) => setOutcome(event.target.value)}
            className="block border rounded p-2 w-full"
          >
            <option value="approved">Setujui</option>
            <option value="rejected">Tolak</option>
            <option value="action-required">Minta perbaikan</option>
          </select>
        </div>
      )}
      {outcome !== "action-required" && (
        <>
          <label className="block">
            Sumber pemeriksaan independen
            <select
              name="checkSource"
              required
              defaultValue=""
              className="block border rounded p-2 w-full"
            >
              <option value="" disabled>
                Pilih sumber
              </option>
              <option value="trusted-alumnus">Alumni tepercaya</option>
              <option value="school-staff">Staf sekolah</option>
            </select>
          </label>
          <label className="block">
            Catatan pemeriksaan independen
            <Textarea
              name="checkNote"
              required
              maxLength={1000}
              className="block border rounded p-2 w-full"
            />
          </label>
          <p>
            Catat siapa yang dihubungi, cara pemeriksaan, dan hasil konfirmasi identitas/kelayakan.
            Catatan ini hanya tersedia untuk pemeriksa. Jangan unggah dokumen identitas atau
            mencatat rincian disiplin.
          </p>
        </>
      )}
      <label className="block">
        Alasan internal
        <Textarea
          name="reason"
          required
          maxLength={1000}
          className="block border rounded p-2 w-full"
        />
      </label>
      <label className="block">
        Pesan untuk pemohon
        <Textarea
          name="applicantMessage"
          required
          maxLength={1000}
          className="block border rounded p-2 w-full"
        />
      </label>
      <p>
        Pesan untuk pemohon ditampilkan dalam status dan email. Jelaskan perbaikan yang diperlukan
        tanpa menyertakan catatan pemeriksaan privat.
      </p>
      <Button type="submit" disabled={busy} className="border rounded px-4 py-2">
        {correction ? "Simpan koreksi house setelah tinjauan" : "Simpan keputusan"}
      </Button>
    </Form>
  );
}

export default function MembershipReview({ loaderData, actionData }: Route.ComponentProps) {
  const { application, revisions, decisions, self, references, referenceStatus } = loaderData;
  const busy = useNavigation().state !== "idle";
  const conflict = references.some(
    (reference) => reference.outcome === "endorse" && reference.actorUserId === loaderData.accountId
  );
  return (
    <main className="mx-auto max-w-3xl p-8 space-y-6">
      <h1 className="text-2xl font-semibold">Tinjauan pengajuan keanggotaan</h1>
      <Link to="/admin/membership" className="underline">
        Antrean tinjauan
      </Link>
      <p>{statusLabels[application.status]}</p>
      {actionData?.message && <p role="status">{actionData.message}</p>}
      {actionData?.error && <p role="alert">{actionData.error}</p>}
      <h2 className="text-xl font-semibold">Versi saat ini: {application.revision}</h2>
      {revisions[0] ? (
        <RevisionView revision={revisions[0]} />
      ) : (
        <p>Alumni awal terverifikasi. House: {loaderData.membership?.house}</p>
      )}
      {self || conflict ? (
        <p>Administrator lain harus meninjau pengajuan ini.</p>
      ) : (
        application.status === "pending" &&
        referenceStatus !== "waiting" && (
          <DecisionForm key={application.revision} revision={application.revision} />
        )
      )}
      {!self && !conflict && loaderData.membership?.status === "approved" && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Koreksi house setelah persetujuan</h2>
          <DecisionForm
            key={`correction:${application.revision}`}
            revision={application.revision}
            correction
          />
        </section>
      )}
      {loaderData.membership && (
        <section className="space-y-4">
          <h2>Penangguhan dan pemulihan keanggotaan</h2>
          <p>
            {loaderData.membership.status === "suspended"
              ? "Keanggotaan ditangguhkan"
              : "Keanggotaan disetujui"}
          </p>
          {!self && !conflict && (
            <Form method="post" className="space-y-4">
              <Input type="hidden" name="intent" value="status" />
              <Input type="hidden" name="expectedVersion" value={loaderData.statusVersion} />
              <Input
                type="hidden"
                name="outcome"
                value={loaderData.membership.status === "approved" ? "suspended" : "approved"}
              />
              <label>
                Alasan perubahan status (privat)
                <Textarea name="reason" required maxLength={1000} />
              </label>
              <label>
                Pesan perubahan status untuk anggota
                <Textarea name="applicantMessage" required maxLength={1000} />
              </label>
              <p>
                Alasan internal hanya untuk pemeriksa. Perubahan ini tidak mengubah peran yang
                ditetapkan secara terpisah.
              </p>
              <Button type="submit" disabled={busy}>
                {loaderData.membership.status === "approved"
                  ? "Tangguhkan keanggotaan"
                  : "Pulihkan keanggotaan"}
              </Button>
            </Form>
          )}
          <h3>Riwayat tinjauan penangguhan privat</h3>
          {loaderData.suspensionRequests.map((review) => (
            <article key={review.id}>
              <p>{review.resolvedBy ? "Tinjauan selesai" : "Menunggu tinjauan"}</p>
              <p>{review.explanation}</p>
              <p>Waktu (UTC): {review.requestedAt}</p>
            </article>
          ))}
          <h3>Riwayat perubahan status privat</h3>
          {loaderData.statusDecisions.map((decision) => (
            <article key={decision.id}>
              <p>{decision.outcome === "suspended" ? "Ditangguhkan" : "Dipulihkan"}</p>
              <p>Pemeriksa: {decision.actorUserId}</p>
              <p>Alasan: {decision.reason}</p>
              <p>Pesan untuk anggota: {decision.applicantMessage}</p>
              <p>Waktu (UTC): {decision.occurredAt}</p>
            </article>
          ))}
        </section>
      )}
      {loaderData.corrections.length > 0 && (
        <section>
          <h2>Riwayat koreksi house privat</h2>
          {loaderData.corrections.map((correction) => (
            <article key={correction.revision}>
              <p>
                Versi {correction.revision}: {correction.oldHouse} → {correction.house}
              </p>
              <p>Pemeriksa: {correction.actorUserId}</p>
              <p>Alasan: {correction.reason}</p>
              <p>Sumber: {correction.checkSource}</p>
              <p>Catatan pemeriksaan baru: {correction.checkNote}</p>
              <p>Waktu (UTC): {correction.occurredAt}</p>
            </article>
          ))}
        </section>
      )}
      {referenceStatus === "waiting" && (
        <p>Menunggu respons referensi sebelum tinjauan administrator.</p>
      )}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Riwayat referensi privat</h2>
        {references.map((reference) => (
          <article key={reference.revision} className="border rounded p-4 space-y-2">
            <p>
              Versi {reference.revision}: {reference.email}
            </p>
            <p>Berlaku sampai (UTC): {reference.expiresAt}</p>
            <p>
              Respons:{" "}
              {reference.outcome === "endorse"
                ? "Dukung"
                : reference.outcome === "decline"
                  ? "Tolak dukungan"
                  : reference.outcome === "cannot-confirm"
                    ? "Tidak dapat memastikan"
                    : "Belum dijawab"}
            </p>
            {reference.outcome && (
              <>
                <p>Akun referensi: {reference.actorUserId}</p>
                <p>Kenal pribadi semasa sekolah: {reference.personallyKnown ? "Ya" : "Tidak"}</p>
                <p>Komentar privat: {reference.comment}</p>
                <p>Waktu respons (UTC): {reference.occurredAt}</p>
              </>
            )}
          </article>
        ))}
      </section>
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Riwayat keputusan privat</h2>
        {decisions.map((decision) => (
          <article key={decision.id} className="border rounded p-4 space-y-2">
            <h3>
              Versi {decision.revision}: {statusLabels[decision.outcome]}
            </h3>
            <p>Pemeriksa (ID akun): {decision.actorUserId}</p>
            <p>Waktu (UTC): {decision.occurredAt}</p>
            <p>Alasan internal: {decision.reason}</p>
            {decision.checkSource && (
              <>
                <p>
                  Sumber:{" "}
                  {decision.checkSource === "trusted-alumnus" ? "Alumni tepercaya" : "Staf sekolah"}
                </p>
                <p>Catatan: {decision.checkNote}</p>
              </>
            )}
            <p>Pesan untuk pemohon: {decision.applicantMessage}</p>
          </article>
        ))}
      </section>
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Riwayat versi pengajuan</h2>
        {revisions.map((revision) => (
          <article key={revision.revision} className="border rounded p-4">
            <h3>Versi {revision.revision}</h3>
            <RevisionView revision={revision} />
          </article>
        ))}
      </section>
    </main>
  );
}
