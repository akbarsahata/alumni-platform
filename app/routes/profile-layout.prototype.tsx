// Throwaway: three responsive profile layouts on /profile?variant=A|B|C.
import { useState } from "react";
import { Toaster, toast } from "sonner";
import { Link, useSearchParams } from "react-router";
import type { Route } from "./+types/profile";
import { LocationSelect } from "../profiles/location-select";
import { cityOptions, countryOptions } from "../profiles/locations";
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
import { PrototypeSwitcher } from "../components/prototype-switcher";
import "./profile-layout.prototype.css";
const reasons: Record<string, string> = {
  membership: "Keanggotaan ditangguhkan.",
  participation: "Partisipasi belum diaktifkan.",
  unavailable: "Anda sementara tidak tersedia.",
  stale: "Konfirmasi profil diperlukan setelah 12 bulan.",
  incomplete: "Pilihan profil belum lengkap.",
};
export function ProfileLayoutPrototype({ loaderData }: Pick<Route.ComponentProps, "loaderData">) {
  const [params] = useSearchParams();
  const variant = params.get("variant") || "A";
  const [section, setSection] = useState("about");
  const [snapshot, setSnapshot] = useState<Record<string, FormDataEntryValue[]> | null>(null);

  const { profile, identity, eligibility, membershipStatus } = loaderData;

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
      <main className={`profile-prototype profile-prototype-${variant}`} data-section={section}>
        <p className="eyebrow">PROTOTIPE · TATA LETAK</p>
        <h1 className="text-2xl font-semibold">Profil keahlian</h1>
        <Link to="/">Beranda</Link>
        <details className="prototype-privacy">
          <summary>Profil privat · Email hanya dibagikan dengan persetujuan</summary>{" "}
          <p>
            Profil ini privat. Partisipasi memungkinkan koordinator direktori menemukan keahlian
            Anda untuk kebutuhan sekolah. Email dibagikan hanya setelah persetujuan terpisah untuk
            suatu perkenalan.
          </p>
        </details>
        <details className="prototype-identity">
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
        <div className="prototype-status">
          <p>
            Kelayakan penjangkauan:{" "}
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
        </div>
        {membershipStatus === "approved" ? (
          <>
            <nav className="prototype-sections" aria-label="Bagian profil">
              {[
                ["about", "Tentang Anda"],
                ["skills", "Keahlian & bantuan"],
                ["availability", "Partisipasi"],
              ].map(([key, label]) => (
                <button
                  type="button"
                  key={key}
                  aria-pressed={section === key}
                  onClick={() => setSection(key)}
                >
                  {label}
                </button>
              ))}
            </nav>
            <form
              id="profile-prototype-form"
              className="prototype-grid"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                setSnapshot(
                  Object.fromEntries(
                    [...new Set(data.keys())].map((key) => [key, data.getAll(key)])
                  )
                );
                toast.success("Pratinjau tersimpan di memori. Data profil tetap.", {
                  toasterId: "profile",
                });
              }}
            >
              <section className="prototype-panel prototype-about">
                <h2>Tentang Anda</h2>
                <label className="block">
                  Nama tampilan (opsional)
                  <Input name="displayName" defaultValue={profile.displayName} maxLength={200} />
                </label>
                <label className="block">
                  Perkenalan profesional (opsional)
                  <Textarea
                    name="introduction"
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
              <section className="prototype-panel prototype-skills">
                <h2>Keahlian & bantuan</h2>
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
              </section>
              <section className="prototype-panel prototype-availability">
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
                  Centang agar profil dapat ditemukan dan menerima permintaan bantuan sekolah. Hapus
                  centang untuk menghentikan pencarian dan permintaan baru; profil tetap tersimpan
                  dan bisa diedit.
                </p>
                <label className="block">
                  <input
                    type="checkbox"
                    style={{ width: "auto", minHeight: "auto", marginRight: "0.5rem" }}
                    aria-describedby="participation-consent-help"
                    name="participationConsent"
                  />{" "}
                  Saya menyetujui profil ditemukan koordinator direktori dan menerima permintaan
                  bantuan sekolah.
                </label>
                <p id="participation-consent-help" className="text-sm text-muted-foreground">
                  Centang untuk menyetujui partisipasi aktif saat menyimpan. Jika tidak menyetujui,
                  hapus centang dan matikan “Aktifkan partisipasi” terlebih dahulu. Ini tidak
                  membagikan email; perkenalan perlu persetujuan terpisah.
                </p>
              </section>
            </form>
            <div className="prototype-save">
              <p>Profil privat · Simpan untuk mengonfirmasi informasi</p>
              <Button type="submit" form="profile-prototype-form">
                Simpan pratinjau
              </Button>
            </div>
            <details className="prototype-state">
              <summary>
                Data pratinjau · {variant} · {section}
              </summary>
              <pre>
                {JSON.stringify(
                  {
                    variant,
                    section,
                    membershipStatus,
                    identity,
                    eligibility,
                    profile,
                    draft: snapshot,
                  },
                  null,
                  2
                )}
              </pre>
            </details>
          </>
        ) : (
          <p>Anda dapat melihat profil sendiri. Perbarui setelah keanggotaan dipulihkan.</p>
        )}
      </main>
      <PrototypeSwitcher />
    </>
  );
}
