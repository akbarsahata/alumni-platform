import { env } from "cloudflare:workers";
import { Form, Link, data, useNavigation } from "react-router";
import type { Route } from "./+types/profile";
import { readProfile, saveProfile } from "../profiles/profiles.server";
import {
  expertiseTags,
  expertiseLabels,
  helpTypes,
  helpLabels,
  availabilityChoices,
  availabilityLabels,
} from "../profiles/model";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Button } from "../components/ui/button";
import { pageTitle } from "../content/page-title";
export function meta() {
  return [{ title: pageTitle("Profil keahlian") }];
}
export async function loader({ request }: Route.LoaderArgs) {
  return await readProfile(request, env);
}
export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  try {
    const confirm = form.get("intent") === "confirm";
    const input = confirm
      ? {}
      : {
          displayName: form.get("displayName"),
          introduction: form.get("introduction"),
          city: form.get("city"),
          country: form.get("country"),
          availabilityNote: form.get("availabilityNote"),
          expertiseTags: form.getAll("expertiseTags"),
          helpTypes: form.getAll("helpTypes"),
          availability: form.get("availability") || null,
          participation: form.get("participation") === "on",
          participationConsent: form.get("participationConsent") === "on",
        };
    await saveProfile(request, env, input, confirm);
    return {
      error: null,
      message: confirm ? "Profil dikonfirmasi." : "Profil tersimpan dan dikonfirmasi.",
    };
  } catch (error) {
    if (!(error instanceof Response) || ![400, 409].includes(error.status)) throw error;
    return data({ error: await error.text(), message: null }, { status: error.status });
  }
}
const reasons: Record<string, string> = {
  membership: "Keanggotaan ditangguhkan.",
  participation: "Partisipasi belum diaktifkan.",
  unavailable: "Anda sementara tidak tersedia.",
  stale: "Konfirmasi profil diperlukan setelah 12 bulan.",
  incomplete: "Pilihan profil belum lengkap.",
};
export default function Profile({ loaderData, actionData }: Route.ComponentProps) {
  const { profile, identity, eligibility, membershipStatus } = loaderData;
  const busy = useNavigation().state !== "idle";
  return (
    <main className="mx-auto max-w-2xl p-8 space-y-6">
      <h1 className="text-2xl font-semibold">Profil keahlian</h1>
      <Link to="/">Beranda</Link>
      <p>
        Profil ini privat. Partisipasi memungkinkan koordinator direktori menemukan keahlian Anda
        untuk kebutuhan sekolah. Email dibagikan hanya setelah persetujuan terpisah untuk suatu
        perkenalan.
      </p>
      <section aria-label="Identitas sekolah terverifikasi">
        <h2>Identitas sekolah terverifikasi</h2>
        <p>
          Nama semasa sekolah:{" "}
          {identity.schoolName ?? "Belum tercatat dalam pengajuan terverifikasi"}
        </p>
        <p>House: {identity.house}</p>
        {identity.studentType === "graduate" ? (
          <p>Tahun kelulusan: {identity.graduationYear}</p>
        ) : identity.studentType === "former-student" ? (
          <p>
            Tahun bersekolah: {identity.attendanceStart}–{identity.attendanceEnd}
          </p>
        ) : null}
        <p>Perubahan identitas sekolah memerlukan tinjauan administrator keanggotaan.</p>
      </section>
      <p>
        Kelayakan penjangkauan:{" "}
        {eligibility.eligible ? "Memenuhi syarat" : reasons[eligibility.reason!]}
      </p>
      <p>Konfirmasi terakhir (UTC): {profile.confirmedAt ?? "Belum dikonfirmasi"}</p>
      <p>
        Profil harus dikonfirmasi kembali setiap 12 bulan agar dapat ditemukan dan menerima
        permintaan baru. Menyimpan profil juga mengonfirmasi informasinya.
      </p>
      {actionData?.message && <p role="status">{actionData.message}</p>}
      {actionData?.error && <p role="alert">{actionData.error}</p>}
      {membershipStatus === "approved" ? (
        <>
          <Form method="post" className="space-y-4" key={profile.confirmedAt ?? "new"}>
            <label className="block">
              Nama tampilan (opsional)
              <Input name="displayName" defaultValue={profile.displayName} maxLength={200} />
            </label>
            <label className="block">
              Perkenalan profesional (opsional)
              <Textarea name="introduction" defaultValue={profile.introduction} maxLength={2000} />
            </label>
            <p>Jelaskan juga keahlian yang belum ada di daftar.</p>
            <label className="block">
              Kota (opsional)
              <Input name="city" defaultValue={profile.city} maxLength={100} />
            </label>
            <label className="block">
              Negara (opsional)
              <Input name="country" defaultValue={profile.country} maxLength={100} />
            </label>
            <fieldset>
              <legend>Keahlian</legend>
              {expertiseTags.map((tag) => (
                <label className="block" key={tag}>
                  <input
                    type="checkbox"
                    style={{ width: "auto", minHeight: "auto", marginRight: "0.5rem" }}
                    name="expertiseTags"
                    value={tag}
                    defaultChecked={profile.expertiseTags.includes(tag)}
                  />{" "}
                  {expertiseLabels[tag]}
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend>Bentuk bantuan</legend>
              {helpTypes.map((type) => (
                <label className="block" key={type}>
                  <input
                    type="checkbox"
                    style={{ width: "auto", minHeight: "auto", marginRight: "0.5rem" }}
                    name="helpTypes"
                    value={type}
                    defaultChecked={profile.helpTypes.includes(type)}
                  />{" "}
                  {helpLabels[type]}
                </label>
              ))}
            </fieldset>
            <div>
              <label htmlFor="profile-availability">Ketersediaan</label>
              <select
                id="profile-availability"
                name="availability"
                defaultValue={profile.availability ?? ""}
              >
                <option value="">Pilih ketersediaan</option>
                {availabilityChoices.map((value) => (
                  <option key={value} value={value}>
                    {availabilityLabels[value]}
                  </option>
                ))}
              </select>
            </div>
            <label className="block">
              Catatan ketersediaan (opsional)
              <Textarea
                name="availabilityNote"
                defaultValue={profile.availabilityNote}
                maxLength={1000}
              />
            </label>
            <label className="block">
              <input
                type="checkbox"
                style={{ width: "auto", minHeight: "auto", marginRight: "0.5rem" }}
                name="participation"
                defaultChecked={profile.participation}
              />{" "}
              Aktifkan partisipasi
            </label>
            <label className="block">
              <input
                type="checkbox"
                style={{ width: "auto", minHeight: "auto", marginRight: "0.5rem" }}
                name="participationConsent"
              />{" "}
              Saya menyetujui profil ditemukan koordinator direktori dan menerima permintaan bantuan
              sekolah.
            </label>
            <p>
              Menonaktifkan partisipasi atau memilih sementara tidak tersedia langsung menghentikan
              kelayakan untuk pencarian dan permintaan baru. Anda tetap dapat mengedit profil saat
              partisipasi dimatikan.
            </p>
            <Button type="submit" disabled={busy}>
              Simpan profil
            </Button>
          </Form>
          {profile.confirmedAt && (
            <Form method="post">
              <input type="hidden" name="intent" value="confirm" />
              <Button disabled={busy}>Konfirmasi profil masih benar</Button>
            </Form>
          )}
        </>
      ) : (
        <p>Anda dapat melihat profil sendiri. Perbarui setelah keanggotaan dipulihkan.</p>
      )}
    </main>
  );
}
