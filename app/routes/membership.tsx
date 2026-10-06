import { requestSuspensionReview } from "../membership/suspensions.server";
import { pageTitle } from "../content/page-title";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { env } from "cloudflare:workers";
import { useState } from "react";
import { Form, Link, data, useNavigation } from "react-router";
import type { Route } from "./+types/membership";
import { getAccess } from "../authorization/permissions.server";
import { readApplication, submitApplication } from "../membership/applications.server";
import { houses, statusLabels, type Revision } from "../membership/model";
import { RevisionView } from "../membership/revision-view";
import { recoverReference, requestReference } from "../membership/references.server";
import { referenceStatusLabels } from "../membership/model";

export function meta() {
  return [{ title: pageTitle("Pengajuan keanggotaan") }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { account, membership } = await getAccess(request, env);
  return { ...(await readApplication(env, account.id)), membership };
}

export async function action({ request }: Route.ActionArgs) {
  await getAccess(request, env);
  const form = await request.formData();
  try {
    if (form.get("intent") === "suspension-review") {
      await requestSuspensionReview(request, env, Object.fromEntries(form));
      return { error: null, message: "Permintaan tinjauan penangguhan tersimpan." };
    }
    if (["replacement", "manual-review"].includes(String(form.get("intent")))) {
      const result = await recoverReference(
        request,
        env,
        Object.fromEntries(form),
        form.get("intent") === "manual-review"
      );
      return { error: null, message: result.message };
    }
    if (form.get("intent") === "reference") {
      const result = await requestReference(request, env, Object.fromEntries(form));
      return { error: null, message: result.message };
    }
    const result = await submitApplication(request, env, Object.fromEntries(form));
    return {
      error: null,
      message: result.notificationPending
        ? "Pengajuan tersimpan. Pemberitahuan email menunggu pengiriman."
        : "Pengajuan tersimpan. Status menunggu tinjauan manual.",
    };
  } catch (error) {
    if (!(error instanceof Response) || ![400, 409].includes(error.status)) throw error;
    return data({ error: await error.text(), message: null }, { status: error.status });
  }
}

function ApplicationForm({ current, revision }: { current?: Revision; revision: number }) {
  const [studentType, setStudentType] = useState(current?.studentType ?? "graduate");
  const busy = useNavigation().state !== "idle";
  const year = new Date().getUTCFullYear();
  return (
    <Form method="post" className="space-y-4">
      <Input type="hidden" name="expectedRevision" value={revision} />
      <label className="block">
        Nama semasa sekolah
        <Input
          name="schoolName"
          required
          maxLength={200}
          defaultValue={current?.schoolName}
          className="block border rounded p-2 w-full"
        />
      </label>
      <label className="block">
        Riwayat sekolah
        <select
          name="studentType"
          value={studentType}
          onChange={(event) => setStudentType(event.target.value as Revision["studentType"])}
          className="block border rounded p-2 w-full"
        >
          <option value="graduate">Lulus</option>
          <option value="former-student">Pernah bersekolah, tidak lulus</option>
        </select>
      </label>
      {studentType === "graduate" ? (
        <label className="block">
          Tahun kelulusan
          <Input
            name="graduationYear"
            type="number"
            min={1900}
            max={year}
            required
            defaultValue={current?.graduationYear ?? ""}
            className="block border rounded p-2 w-full"
          />
        </label>
      ) : (
        <>
          <p>Kelayakan mantan siswa dinilai secara individual melalui tinjauan manual.</p>
          <label className="block">
            Tahun mulai bersekolah
            <Input
              name="attendanceStart"
              type="number"
              min={1900}
              max={year}
              required
              defaultValue={current?.attendanceStart ?? ""}
              className="block border rounded p-2 w-full"
            />
          </label>
          <label className="block">
            Tahun terakhir bersekolah
            <Input
              name="attendanceEnd"
              type="number"
              min={1900}
              max={year}
              required
              defaultValue={current?.attendanceEnd ?? ""}
              className="block border rounded p-2 w-full"
            />
          </label>
        </>
      )}
      <div>
        <label htmlFor="application-house">House</label>
        <select
          id="application-house"
          name="house"
          required
          defaultValue={current?.house ?? ""}
          className="block border rounded p-2 w-full"
        >
          <option value="" disabled>
            Pilih satu house
          </option>
          {houses.map((house) => (
            <option key={house}>{house}</option>
          ))}
        </select>
      </div>
      <label className="block">
        Penjelasan untuk tinjauan manual
        <Textarea
          name="explanation"
          required
          maxLength={1000}
          defaultValue={current?.explanation}
          className="block border rounded p-2 w-full"
        />
      </label>
      <p>
        Jelaskan kebutuhan tinjauan manual secara singkat. Pemeriksa akan menghubungi alumni
        tepercaya atau staf sekolah. Jangan kirim dokumen identitas atau rincian riwayat disiplin.
      </p>
      <p>Setiap perbaikan disimpan sebagai versi baru dan memerlukan tinjauan baru.</p>
      <Button type="submit" disabled={busy} className="border rounded px-4 py-2">
        {revision ? "Kirim perbaikan" : "Kirim pengajuan"}
      </Button>
    </Form>
  );
}

export default function Membership({ loaderData, actionData }: Route.ComponentProps) {
  const { application, revisions, decisions, membership, referenceStatus } = loaderData;
  const canApply = membership.status === "none" && application?.status !== "approved";
  return (
    <main className="mx-auto max-w-2xl p-8 space-y-6">
      <h1 className="text-2xl font-semibold">Pengajuan keanggotaan</h1>
      <Link to="/" className="underline">
        Beranda
      </Link>
      <p>
        {membership.status === "suspended"
          ? "Keanggotaan ditangguhkan"
          : application
            ? application.status === "pending" && referenceStatus
              ? referenceStatusLabels[referenceStatus]
              : statusLabels[application.status]
            : membership.status === "approved"
              ? "Keanggotaan disetujui"
              : "Belum ada pengajuan"}
      </p>
      {actionData?.message && <p role="status">{actionData.message}</p>}
      {actionData?.error && <p role="alert">{actionData.error}</p>}
      {decisions.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Pesan pemeriksa</h2>
          {decisions.map((decision) => (
            <div key={decision.revision} className="border rounded p-3">
              <p>
                Versi {decision.revision}: {statusLabels[decision.outcome]}
              </p>
              <p className="whitespace-pre-wrap">{decision.applicantMessage}</p>
              <p>Waktu (UTC): {decision.occurredAt}</p>
            </div>
          ))}
        </section>
      )}
      <section className="space-y-4">
        {loaderData.suspension.decisions.map((decision) => (
          <article key={decision.id}>
            <p>
              {decision.outcome === "suspended"
                ? "Keanggotaan ditangguhkan"
                : "Keanggotaan dipulihkan"}
            </p>
            <p>{decision.applicantMessage}</p>
            <p>Waktu (UTC): {decision.occurredAt}</p>
          </article>
        ))}
        {loaderData.suspension.requests.map((review) => (
          <article key={review.id}>
            <p>
              {review.resolved
                ? "Tinjauan penangguhan selesai"
                : "Permintaan tinjauan menunggu pemeriksa"}
            </p>
            <p>{review.explanation}</p>
            <p>Waktu (UTC): {review.requestedAt}</p>
          </article>
        ))}
        {membership.status === "suspended" &&
          loaderData.suspension.suspensionId &&
          !loaderData.suspension.requests.some((r) => !r.resolved) && (
            <Form method="post" className="space-y-4">
              <Input type="hidden" name="intent" value="suspension-review" />
              <Input type="hidden" name="suspensionId" value={loaderData.suspension.suspensionId} />
              <label>
                Penjelasan tinjauan penangguhan
                <Textarea name="explanation" required maxLength={1000} />
              </label>
              <Button type="submit">Minta tinjauan penangguhan</Button>
            </Form>
          )}
      </section>
      {canApply && (
        <ApplicationForm
          key={`${application?.revision ?? 0}:${application?.status ?? "new"}`}
          current={revisions[0]}
          revision={application?.revision ?? 0}
        />
      )}
      {canApply &&
        application?.status === "pending" &&
        revisions[0]?.studentType === "graduate" &&
        !referenceStatus && (
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Minta referensi alumni</h2>
            <p>
              Masukkan email alumni dari house yang sama yang kenal pribadi dengan Anda semasa
              sekolah. Tahun kelulusan boleh berbeda. Pemeriksa tetap menentukan keputusan
              keanggotaan.
            </p>
            <Form method="post" className="space-y-4">
              <Input type="hidden" name="intent" value="reference" />
              <Input type="hidden" name="expectedRevision" value={application.revision} />
              <label className="block">
                Email referensi
                <Input name="email" type="email" maxLength={254} required />
              </label>
              <Button type="submit">Kirim permintaan referensi</Button>
            </Form>
          </section>
        )}
      {canApply && application?.status === "pending" && referenceStatus && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Ganti referensi atau minta tinjauan manual</h2>
          <p>
            Permintaan berlaku tujuh hari. Anda dapat mengganti referensi atau meminta pemeriksaan
            manual. Tindakan ini membuat versi baru dan membatalkan referensi sebelumnya.
          </p>
          <Form method="post" className="space-y-4">
            <Input type="hidden" name="intent" value="replacement" />
            <Input type="hidden" name="expectedRevision" value={application.revision} />
            <label className="block">
              Email referensi baru
              <Input name="email" type="email" required maxLength={254} />
            </label>
            <Button type="submit">Ganti referensi</Button>
          </Form>
          <Form method="post" className="space-y-4">
            <Input type="hidden" name="intent" value="manual-review" />
            <Input type="hidden" name="expectedRevision" value={application.revision} />
            <label className="block">
              Alasan meminta tinjauan manual
              <Textarea name="explanation" required maxLength={1000} />
            </label>
            <Button type="submit">Minta tinjauan manual</Button>
          </Form>
        </section>
      )}
      {membership.status === "approved" && <p>House terverifikasi: {membership.house}</p>}
      {membership.status === "approved" && (
        <p>
          Koreksi house yang sudah diverifikasi harus ditinjau ulang oleh administrator. Hubungi
          administrator keanggotaan.
        </p>
      )}
      {revisions.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Riwayat pengajuan</h2>
          {revisions.map((revision) => (
            <article key={revision.revision} className="border rounded p-4">
              <h3 className="font-semibold">Versi {revision.revision}</h3>
              <RevisionView revision={revision} />
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
