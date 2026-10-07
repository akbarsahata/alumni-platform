import { LocationSelect } from "../profiles/location-select";
import { cityOptions, countryOptions } from "../profiles/locations";
import { Search, RotateCcw, CircleCheck, Clock, MapPin, Globe } from "lucide-react";
import { env } from "cloudflare:workers";
import { Form, Link, useSearchParams } from "react-router";
import type { Route } from "./+types/directory";
import { searchDirectory } from "../profiles/directory.server";
import { helpLabels, helpTypes, availabilityLabels } from "../profiles/model";
import { pageTitle } from "../content/page-title";
export function meta() {
  return [{ title: pageTitle("Direktori keahlian") }];
}
export async function loader({ request }: Route.LoaderArgs) {
  return searchDirectory(request, env);
}
export default function Directory({ loaderData }: Route.ComponentProps) {
  const [params] = useSearchParams();
  const { profiles, tags, nextCursor } = loaderData;
  const next = new URLSearchParams(params);
  if (nextCursor) next.set("cursor", nextCursor);
  return (
    <main className="directory-page mx-auto max-w-4xl space-y-5">
      <h1>Direktori keahlian</h1>
      <Link to="/">Beranda</Link> · <Link to="/directory/tags">Kelola keahlian</Link>
      <p>
        Hanya alumni yang menyetujui partisipasi, tersedia, dan mengonfirmasi profil dalam 12 bulan
        terakhir. Tahun bersekolah terpisah dari tahun kelulusan.
      </p>
      <Form method="get" key={params.toString()} className="directory-filters">
        <label>
          Keahlian
          <select name="expertise" defaultValue={params.get("expertise") ?? ""}>
            <option value="">Semua keahlian</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.label}
                {tag.retired ? " (dihentikan)" : ""}
              </option>
            ))}
          </select>
        </label>
        {[["introduction", "Perkenalan profesional"]].map(([name, label]) => (
          <label key={name}>
            {label}
            <input name={name} defaultValue={params.get(name) ?? ""} maxLength={200} />
          </label>
        ))}
        <LocationSelect
          kind="city"
          label="Kota"
          options={cityOptions}
          initialValues={params.getAll("city").filter(Boolean)}
        />
        <LocationSelect
          kind="country"
          label="Negara"
          options={countryOptions}
          initialValues={params.getAll("country").filter(Boolean)}
        />
        <label>
          Bentuk bantuan
          <select name="helpType" defaultValue={params.get("helpType") ?? ""}>
            <option value="">Semua bentuk bantuan</option>
            {helpTypes.map((type) => (
              <option key={type} value={type}>
                {helpLabels[type]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Ketersediaan
          <select name="availability" defaultValue={params.get("availability") ?? ""}>
            <option value="">Semua yang tersedia</option>
            <option value="available">Tersedia</option>
            <option value="limited">Ketersediaan terbatas</option>
          </select>
        </label>
        {[
          ["graduationFrom", "Kelulusan dari tahun"],
          ["graduationTo", "Kelulusan sampai tahun"],
          ["attendanceFrom", "Bersekolah dari tahun"],
          ["attendanceTo", "Bersekolah sampai tahun"],
        ].map(([name, label]) => (
          <label key={name}>
            {label}
            <input
              type="number"
              name={name}
              min="1900"
              max={new Date().getUTCFullYear()}
              defaultValue={params.get(name) ?? ""}
            />
          </label>
        ))}
        <div className="directory-search-actions">
          <button
            className="directory-icon-action"
            type="submit"
            aria-label="Cari alumni"
            title="Cari alumni"
          >
            <Search size={18} aria-hidden="true" />
          </button>
          <Link
            className="directory-reset"
            to="/directory"
            aria-label="Reset filter"
            title="Reset filter"
          >
            <RotateCcw size={18} aria-hidden="true" />
          </Link>
        </div>
      </Form>
      <section aria-label="Hasil pencarian">
        <h2>Hasil pencarian</h2>
        {!profiles.length && <p>Tidak ada profil yang sesuai.</p>}
        <div className="directory-results-grid">
          {profiles.map((p) => (
            <article key={p.id} className="directory-result">
              <div className="directory-result-heading">
                <h3>
                  <Link to={`/directory/${p.id}`}>{p.displayName || p.schoolName || "Alumni"}</Link>
                </h3>
                {p.availability && (
                  <span
                    className={`directory-availability ${p.availability}`}
                    role="img"
                    aria-label={availabilityLabels[p.availability]}
                    title={availabilityLabels[p.availability]}
                  >
                    {p.availability === "available" ? (
                      <CircleCheck size={19} aria-hidden="true" />
                    ) : (
                      <Clock size={19} aria-hidden="true" />
                    )}
                  </span>
                )}
              </div>
              <p className="directory-introduction">{p.introduction}</p>
              <div className="directory-places">
                {p.city.map((city) => (
                  <span key={city}>
                    <MapPin size={13} aria-hidden="true" />
                    {city}
                  </span>
                ))}
                {p.country.map((country) => (
                  <span key={country}>
                    <Globe size={13} aria-hidden="true" />
                    {country}
                  </span>
                ))}
              </div>
              <div className="directory-badges">
                {p.expertiseTags.map((id) => (
                  <span key={id}>{tags.find((t) => t.id === id)?.label ?? id}</span>
                ))}
              </div>
              {p.studentType === "graduate" ? (
                <p className="directory-cohort">Kelulusan: {p.graduationYear}</p>
              ) : p.studentType === "former-student" ? (
                <p className="directory-cohort">
                  Bersekolah: {p.attendanceStart}–{p.attendanceEnd}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      </section>
      {nextCursor && <Link to={`?${next}`}>Halaman berikutnya</Link>}
    </main>
  );
}
