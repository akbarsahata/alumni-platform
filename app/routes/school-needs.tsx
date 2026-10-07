import { env } from "cloudflare:workers";
import { Form, Link, data, useNavigation } from "react-router";
import type { Route } from "./+types/school-needs";
import { pageTitle } from "../content/page-title";
import { needCategories, needCategoryLabels } from "../school-needs/model";
import { readSchoolNeeds, submitSchoolNeed } from "../school-needs/school-needs.server";

export function meta() {
  return [{ title: pageTitle("Kebutuhan sekolah") }];
}

export async function loader({ request }: Route.LoaderArgs) {
  return await readSchoolNeeds(request, env);
}

function formInput(form: FormData) {
  return {
    category: form.get("category"),
    title: form.get("title"),
    purpose: form.get("purpose"),
    requestedHelp: form.get("requestedHelp"),
    timeCommitment: form.get("timeCommitment"),
    timing: form.get("timing"),
    deadline: form.get("deadline") || null,
    locationMode: form.get("locationMode"),
    locationDetails: form.get("locationDetails"),
    staffContactUserId: form.get("staffContactUserId"),
    staffContactName: form.get("staffContactName"),
    participationTerms: form.get("participationTerms"),
    paidDetails: form.get("paidDetails"),
    initiativeLink: form.get("initiativeLink"),
  };
}

export async function action({ request }: Route.ActionArgs) {
  try {
    await submitSchoolNeed(request, env, formInput(await request.formData()));
    return { error: null, message: "Kebutuhan sekolah berhasil dikirim untuk ditinjau." };
  } catch (error) {
    if (!(error instanceof Response) || ![400, 403, 409].includes(error.status)) throw error;
    return data({ error: await error.text(), message: null }, { status: error.status });
  }
}

const statusLabels = {
  "awaiting-staff": "Menunggu validasi perwakilan staf",
  "awaiting-coordinator": "Menunggu persetujuan koordinator direktori",
  approved: "Disetujui untuk penjangkauan",
};

function NeedList({
  title,
  needs,
}: {
  title: string;
  needs: Awaited<ReturnType<typeof readSchoolNeeds>>["ownNeeds"];
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">{title}</h2>
      {needs.length ? (
        <ul className="space-y-2">
          {needs.map((need) => (
            <li key={need.id}>
              <Link to={`/school-needs/${need.id}`}>
                {need.title} · {statusLabels[need.status]} · versi {need.version}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p>Belum ada kebutuhan untuk ditinjau.</p>
      )}
    </section>
  );
}

export default function SchoolNeeds({ loaderData, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== "idle";
  const hasContacts = loaderData.staffContacts.length > 0;
  return (
    <main className="mx-auto max-w-3xl space-y-8">
      <h1 className="text-2xl font-semibold">Kebutuhan sekolah</h1>
      <p>
        Ajukan kegiatan sekolah atau pendampingan siswa. Kebutuhan harus divalidasi oleh staf yang
        disebutkan dan disetujui koordinator direktori sebelum penjangkauan. Profil alumni tidak
        diperlukan untuk mengajukan kebutuhan.
      </p>
      {actionData?.error && <p role="alert">{actionData.error}</p>}
      {actionData?.message && <p role="status">{actionData.message}</p>}
      <section aria-label="Ajukan kebutuhan sekolah" className="space-y-4">
        <h2 className="text-xl font-semibold">Ajukan kebutuhan</h2>
        {!hasContacts && (
          <p role="status">Belum ada perwakilan staf sekolah terverifikasi yang dapat dipilih.</p>
        )}
        <Form method="post" className="space-y-4">
          <label className="block">
            Jenis kebutuhan
            <select name="category" required defaultValue="">
              <option value="" disabled>
                Pilih jenis kebutuhan
              </option>
              {needCategories.map((category) => (
                <option key={category} value={category}>
                  {needCategoryLabels[category]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            Judul
            <input name="title" required maxLength={200} />
          </label>
          <label className="block">
            Tujuan sekolah
            <textarea name="purpose" required maxLength={2000} rows={4} />
          </label>
          <label className="block">
            Keahlian atau bantuan yang dibutuhkan
            <textarea name="requestedHelp" required maxLength={2000} rows={4} />
          </label>
          <label className="block">
            Perkiraan komitmen waktu
            <input name="timeCommitment" required maxLength={500} />
          </label>
          <label className="block">
            Waktu pelaksanaan
            <input name="timing" maxLength={500} />
          </label>
          <label className="block">
            Batas waktu (opsional jika waktu pelaksanaan diisi)
            <input name="deadline" type="date" />
          </label>
          <label className="block">
            Lokasi kegiatan
            <select name="locationMode" required defaultValue="">
              <option value="" disabled>
                Pilih lokasi
              </option>
              <option value="remote">Jarak jauh</option>
              <option value="on-site">Di lokasi sekolah</option>
            </select>
          </label>
          <label className="block">
            Alamat/lokasi (wajib untuk kegiatan di lokasi)
            <input name="locationDetails" maxLength={500} />
          </label>
          <label className="block">
            Perwakilan staf terverifikasi
            <select name="staffContactUserId" required defaultValue="">
              <option value="" disabled>
                Pilih kontak staf
              </option>
              {loaderData.staffContacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.name || `Akun staf ${contact.id.slice(0, 8)}`}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            Nama perwakilan staf
            <input name="staffContactName" required maxLength={200} />
          </label>
          <p>Perwakilan bernama ini harus masuk dengan akun staf terverifikasi yang dipilih.</p>
          <label className="block">
            Ketentuan partisipasi
            <select name="participationTerms" required defaultValue="">
              <option value="" disabled>
                Pilih ketentuan
              </option>
              <option value="voluntary">Sukarela</option>
              <option value="paid">Berbayar</option>
            </select>
          </label>
          <label className="block">
            Rincian kompensasi (wajib jika berbayar)
            <textarea name="paidDetails" maxLength={1000} rows={3} />
          </label>
          <label className="block">
            Tautan inisiatif (opsional)
            <input name="initiativeLink" type="url" maxLength={500} />
          </label>
          <button type="submit" disabled={busy || !hasContacts}>
            {busy ? "Mengirim…" : "Kirim kebutuhan"}
          </button>
        </Form>
      </section>
      <NeedList title="Kebutuhan yang saya ajukan" needs={loaderData.ownNeeds} />
      {loaderData.staffQueue.length > 0 && (
        <NeedList title="Menunggu validasi staf Anda" needs={loaderData.staffQueue} />
      )}
      {loaderData.coordinatorQueue.length > 0 && (
        <NeedList
          title="Menunggu persetujuan koordinator direktori"
          needs={loaderData.coordinatorQueue}
        />
      )}
    </main>
  );
}
