import { env } from "cloudflare:workers";
import { Form, Link, data, useNavigation } from "react-router";
import type { Route } from "./+types/school-need";
import { pageTitle } from "../content/page-title";
import { needCategoryLabels, needStatusLabels } from "../school-needs/model";
import { schoolNeedFormInput } from "../school-needs/form-input";
import {
  approveSchoolNeed,
  editSchoolNeed,
  readSchoolNeed,
  validateSchoolNeed,
} from "../school-needs/school-needs.server";

export function meta() {
  return [{ title: pageTitle("Kebutuhan sekolah") }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  return await readSchoolNeed(request, env, params.needId!);
}

export async function action({ request, params }: Route.ActionArgs) {
  const needId = params.needId!;
  const form = await request.formData();
  const intent = form.get("intent");
  try {
    if (intent === "edit") await editSchoolNeed(request, env, needId, schoolNeedFormInput(form));
    else if (intent === "validate")
      await validateSchoolNeed(request, env, needId, {
        expectedVersion: form.get("expectedVersion"),
      });
    else if (intent === "approve")
      await approveSchoolNeed(request, env, needId, {
        expectedVersion: form.get("expectedVersion"),
      });
    else return data({ error: "Tindakan kebutuhan tidak valid.", message: null }, { status: 400 });
    return { error: null, message: "Status kebutuhan sekolah berhasil diperbarui." };
  } catch (error) {
    if (!(error instanceof Response) || ![400, 403, 404, 409].includes(error.status)) throw error;
    return data({ error: await error.text(), message: null }, { status: error.status });
  }
}

export default function SchoolNeed({ loaderData, actionData }: Route.ComponentProps) {
  const { need, access, revisions, approvals } = loaderData;
  const busy = useNavigation().state !== "idle";
  return (
    <main className="mx-auto max-w-3xl space-y-6">
      <Link to="/school-needs">← Kebutuhan sekolah</Link>
      <h1 className="text-2xl font-semibold">{need.title}</h1>
      <p role="status">{needStatusLabels[need.status]}</p>
      {actionData?.error && <p role="alert">{actionData.error}</p>}
      {actionData?.message && <p role="status">{actionData.message}</p>}
      <dl className="space-y-3">
        <div>
          <dt className="font-semibold">Jenis kebutuhan</dt>
          <dd>{needCategoryLabels[need.category]}</dd>
        </div>
        <div>
          <dt className="font-semibold">Tujuan sekolah</dt>
          <dd>{need.purpose}</dd>
        </div>
        <div>
          <dt className="font-semibold">Keahlian atau bantuan</dt>
          <dd>{need.requestedHelp}</dd>
        </div>
        <div>
          <dt className="font-semibold">Komitmen waktu</dt>
          <dd>{need.timeCommitment}</dd>
        </div>
        <div>
          <dt className="font-semibold">Waktu atau batas waktu</dt>
          <dd>{need.timing || need.deadline}</dd>
        </div>
        <div>
          <dt className="font-semibold">Lokasi</dt>
          <dd>
            {need.locationMode === "remote" ? "Jarak jauh" : "Di lokasi sekolah"}{" "}
            {need.locationDetails}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Kontak staf terverifikasi</dt>
          <dd>{need.staffContactName}</dd>
        </div>
        <div>
          <dt className="font-semibold">Ketentuan partisipasi</dt>
          <dd>
            {need.participationTerms === "voluntary" ? "Sukarela" : "Berbayar"}
            {need.paidDetails ? ` · ${need.paidDetails}` : ""}
          </dd>
        </div>
        {need.initiativeLink && (
          <div>
            <dt className="font-semibold">Tautan inisiatif</dt>
            <dd>
              <a href={need.initiativeLink} target="_blank" rel="noreferrer">
                Lihat inisiatif
              </a>
            </dd>
          </div>
        )}
      </dl>
      <section aria-label="Status persetujuan">
        <h2 className="text-xl font-semibold">Persetujuan versi {need.version}</h2>
        <p>Validasi staf: {need.staffValidated ? "Selesai" : "Belum"}</p>
        <p>Persetujuan koordinator direktori: {need.coordinatorApproved ? "Selesai" : "Belum"}</p>
      </section>
      {access.canValidate && (
        <Form method="post">
          <input type="hidden" name="intent" value="validate" />
          <input type="hidden" name="expectedVersion" value={need.version} />
          <button type="submit" disabled={busy}>
            Validasi sebagai perwakilan staf
          </button>
        </Form>
      )}
      {access.canApprove && (
        <Form method="post">
          <input type="hidden" name="intent" value="approve" />
          <input type="hidden" name="expectedVersion" value={need.version} />
          <button type="submit" disabled={busy}>
            Setujui penjangkauan sebagai koordinator direktori
          </button>
        </Form>
      )}
      {access.canEdit && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Ubah rincian kebutuhan</h2>
          <p>Perubahan membuat versi baru dan membatalkan kedua persetujuan sebelumnya.</p>
          <Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="edit" />
            <input type="hidden" name="expectedVersion" value={need.version} />
            <label className="block">
              Jenis kebutuhan
              <select name="category" required defaultValue={need.category}>
                <option value="school-activity">Kegiatan sekolah</option>
                <option value="student-mentoring">Pendampingan siswa</option>
              </select>
            </label>
            <label className="block">
              Judul
              <input name="title" required maxLength={200} defaultValue={need.title} />
            </label>
            <label className="block">
              Tujuan sekolah
              <textarea
                name="purpose"
                required
                maxLength={2000}
                rows={4}
                defaultValue={need.purpose}
              />
            </label>
            <label className="block">
              Keahlian atau bantuan yang dibutuhkan
              <textarea
                name="requestedHelp"
                required
                maxLength={2000}
                rows={4}
                defaultValue={need.requestedHelp}
              />
            </label>
            <label className="block">
              Perkiraan komitmen waktu
              <input
                name="timeCommitment"
                required
                maxLength={500}
                defaultValue={need.timeCommitment}
              />
            </label>
            <label className="block">
              Waktu pelaksanaan
              <input name="timing" maxLength={500} defaultValue={need.timing ?? ""} />
            </label>
            <label className="block">
              Batas waktu
              <input name="deadline" type="date" defaultValue={need.deadline ?? ""} />
            </label>
            <label className="block">
              Lokasi kegiatan
              <select name="locationMode" required defaultValue={need.locationMode}>
                <option value="remote">Jarak jauh</option>
                <option value="on-site">Di lokasi sekolah</option>
              </select>
            </label>
            <label className="block">
              Alamat/lokasi (wajib untuk kegiatan di lokasi)
              <input name="locationDetails" maxLength={500} defaultValue={need.locationDetails} />
            </label>
            <label className="block">
              Perwakilan staf terverifikasi
              <select name="staffContactUserId" required defaultValue={need.staffContactUserId}>
                {loaderData.staffContacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name || `Akun staf ${contact.id.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              Ketentuan partisipasi
              <select name="participationTerms" required defaultValue={need.participationTerms}>
                <option value="voluntary">Sukarela</option>
                <option value="paid">Berbayar</option>
              </select>
            </label>
            <label className="block">
              Rincian kompensasi (wajib jika berbayar)
              <textarea
                name="paidDetails"
                maxLength={1000}
                rows={3}
                defaultValue={need.paidDetails}
              />
            </label>
            <label className="block">
              Tautan inisiatif (opsional)
              <input
                name="initiativeLink"
                type="url"
                maxLength={500}
                defaultValue={need.initiativeLink ?? ""}
              />
            </label>
            <button type="submit" disabled={busy}>
              Simpan versi baru
            </button>
          </Form>
        </section>
      )}
      <section aria-label="Riwayat persetujuan">
        <h2 className="text-xl font-semibold">Riwayat versi dan persetujuan</h2>
        {revisions.map((revision) => (
          <p key={revision.version}>
            Versi {revision.version} · {revision.createdAt}
            {"actorUserId" in revision && revision.actorUserId ? ` · ${revision.actorUserId}` : ""}
          </p>
        ))}
        {approvals.map((approval) => (
          <p key={`${approval.version}-${approval.stage}`}>
            Versi {approval.version} ·{" "}
            {approval.stage === "staff-validation" ? "Validasi staf" : "Persetujuan koordinator"} ·{" "}
            {approval.approvedAt}
            {"actorUserId" in approval && approval.actorUserId ? ` · ${approval.actorUserId}` : ""}
          </p>
        ))}
      </section>
    </main>
  );
}
