import { useEffect } from "react";
import { Toaster, toast } from "sonner";
import { LocationSelect } from "../profiles/location-select";
import { cityOptions, countryOptions } from "../profiles/locations";
import { env } from "cloudflare:workers";
import { Form, Link, data, useNavigation } from "react-router";
import type { Route } from "./+types/profile";
import { readProfile, saveProfile } from "../profiles/profiles.server";
import { helpTypes, helpLabels, availabilityChoices, availabilityLabels } from "../profiles/model";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Button } from "../components/ui/button";
import { pageTitle } from "../content/page-title";
export function meta() {
  return [{ title: pageTitle("Profil & Keahlian") }];
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
          city: form.getAll("city").filter((value) => value !== ""),
          country: form.getAll("country").filter((value) => value !== ""),
          availabilityNote: form.get("availabilityNote"),
          expertiseTags: form.getAll("expertiseTags"),
          helpTypes: form.getAll("helpTypes"),
          availability: form.get("availability") || null,
          participation: form.get("participation") === "on",
          participationConsent: form.get("participation") === "on",
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
  deletion: "Penghapusan profil sedang diproses.",
  participation: "Partisipasi belum diaktifkan.",
  unavailable: "Anda sementara tidak tersedia.",
  stale: "Konfirmasi profil diperlukan setelah 12 bulan.",
  incomplete: "Pilihan profil belum lengkap.",
};
export default function Profile({ loaderData, actionData }: Route.ComponentProps) {
  const { profile, identity, eligibility, membershipStatus, tags } = loaderData;
  const busy = useNavigation().state !== "idle";
  useEffect(() => {
    if (actionData?.message)
      toast.success(actionData.message, { id: "profile-feedback", toasterId: "profile" });
    else if (actionData?.error)
      toast.error(actionData.error, { id: "profile-feedback", toasterId: "profile" });
  }, [actionData]);
  return (
    <>
      <Toaster
        id="profile"
        position="top-center"
        offset={{ top: "80px" }}
        mobileOffset={{ top: "128px" }}
        richColors
        closeButton
        duration={6000}
        containerAriaLabel="Pemberitahuan profil"
        toastOptions={{ closeButtonAriaLabel: "Tutup pemberitahuan" }}
      />
      <main className="profile-page">
        <h1 className="text-2xl font-semibold">Profil & Keahlian</h1>
        <Link to="/">Beranda</Link>
        <details className="profile-privacy">
          <summary>Profil privat · Email hanya dibagikan dengan persetujuan</summary>{" "}
          <p>
            Profil ini privat. Partisipasi memungkinkan koordinator direktori menemukan keahlian
            Anda untuk kebutuhan sekolah. Email dibagikan hanya setelah persetujuan terpisah untuk
            suatu perkenalan.
          </p>
        </details>
        <details className="profile-identity">
          <summary>Identitas sekolah terverifikasi · {identity.house}</summary>
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
        </details>
        <section className="profile-status" aria-label="Status relevansi profil">
          <p>
            Status relevansi profil:{" "}
            {eligibility.eligible ? "Memenuhi syarat" : reasons[eligibility.reason!]}
          </p>
          <p>Konfirmasi terakhir (UTC): {profile.confirmedAt ?? "Belum dikonfirmasi"}</p>
          <details>
            <summary>Konfirmasi setiap 12 bulan</summary>{" "}
            <p>
              Profil harus dikonfirmasi kembali setiap 12 bulan agar dapat ditemukan dan menerima
              permintaan baru. Menyimpan profil juga mengonfirmasi informasinya.
            </p>
          </details>

          {membershipStatus === "approved" && profile.confirmedAt && (
            <Form method="post">
              <input type="hidden" name="intent" value="confirm" />
              <Button disabled={busy}>Konfirmasi profil masih benar</Button>
            </Form>
          )}
        </section>
        {actionData?.message && (
          <noscript>
            <p role="status">{actionData.message}</p>
          </noscript>
        )}
        {actionData?.error && <p role="alert">{actionData.error}</p>}
        {membershipStatus === "approved" ? (
          <>
            <Form
              id="profile-form"
              method="post"
              className="profile-grid"
              key={profile.confirmedAt ?? "new"}
            >
              <section className="profile-panel profile-about">
                <h2>Tentang Anda</h2>
                <label className="block">
                  Nama tampilan (opsional)
                  <Input name="displayName" defaultValue={profile.displayName} maxLength={200} />
                </label>
                <label className="block">
                  Perkenalan profesional (wajib)
                  <Textarea
                    name="introduction"
                    required
                    rows={5}
                    placeholder="Contoh: Saya bekerja sebagai pengembang perangkat lunak dan berpengalaman mendampingi klub robotika sekolah."
                    defaultValue={profile.introduction}
                    maxLength={2000}
                  />
                </label>
                <p>Jelaskan juga keahlian yang belum ada di daftar.</p>
                <LocationSelect
                  kind="city"
                  label="Kota di Indonesia (opsional)"
                  description="Cari dan pilih satu atau beberapa kota di Indonesia. Nama provinsi membantu membedakan kota yang serupa. Kosongkan jika tidak ingin mencantumkan kota."
                  options={cityOptions}
                  initialValues={profile.city}
                />
                <LocationSelect
                  kind="country"
                  label="Negara (opsional)"
                  description="Cari dan pilih satu atau beberapa negara. Kosongkan jika tidak ingin mencantumkan negara."
                  options={countryOptions}
                  initialValues={profile.country}
                />
              </section>
              <section className="profile-panel profile-skills">
                <h2>Keahlian & bantuan</h2>
                <fieldset>
                  <legend>Keahlian</legend>
                  {tags
                    .filter((tag) => !tag.retired || profile.expertiseTags.includes(tag.id))
                    .map((tag) => (
                      <label className="block" key={tag.id}>
                        <input
                          type="checkbox"
                          style={{ width: "auto", minHeight: "auto", marginRight: "0.5rem" }}
                          name="expertiseTags"
                          value={tag.id}
                          defaultChecked={profile.expertiseTags.includes(tag.id)}
                        />{" "}
                        {tag.label}
                        {tag.retired ? " (dihentikan)" : ""}
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
              </section>
              <section className="profile-panel profile-availability">
                <h2>Partisipasi</h2>
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
                    rows={5}
                    placeholder="Contoh: Saya tersedia untuk pendampingan daring pada Sabtu pagi, maksimal dua kali sebulan."
                    defaultValue={profile.availabilityNote}
                    maxLength={1000}
                  />
                </label>
                <label className="block">
                  <input
                    type="checkbox"
                    style={{ width: "auto", minHeight: "auto", marginRight: "0.5rem" }}
                    aria-describedby="participation-help"
                    name="participation"
                    defaultChecked={profile.participation}
                  />{" "}
                  Aktifkan partisipasi
                </label>
                <p id="participation-help" className="text-sm text-muted-foreground">
                  Centang untuk menyetujui profil ditemukan koordinator direktori dan menerima
                  permintaan bantuan sekolah. Hapus centang untuk menghentikan pencarian dan
                  permintaan baru; profil tetap tersimpan dan bisa diedit. Email hanya dibagikan
                  setelah persetujuan terpisah untuk perkenalan.
                </p>
              </section>
            </Form>
            <div className="profile-save">
              <p>Profil privat · Simpan untuk mengonfirmasi informasi</p>
              <Button type="submit" form="profile-form" disabled={busy}>
                {busy ? "Menyimpan…" : "Simpan profil"}
              </Button>
            </div>
          </>
        ) : (
          <p>Anda dapat melihat profil sendiri. Perbarui setelah keanggotaan dipulihkan.</p>
        )}
      </main>
    </>
  );
}
