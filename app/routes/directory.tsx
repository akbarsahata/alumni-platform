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
    <main className="mx-auto max-w-4xl p-8 space-y-6">
      <h1>Direktori keahlian</h1>
      <Link to="/">Beranda</Link> · <Link to="/directory/tags">Kelola keahlian</Link>
      <p>
        Hanya alumni yang menyetujui partisipasi, tersedia, dan mengonfirmasi profil dalam 12 bulan
        terakhir. Tahun bersekolah terpisah dari tahun kelulusan.
      </p>
      <Form method="get" key={params.toString()} className="grid gap-4 sm:grid-cols-2">
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
        {[
          ["introduction", "Perkenalan profesional"],
          ["city", "Kota"],
          ["country", "Negara"],
        ].map(([name, label]) => (
          <label key={name}>
            {label}
            <input name={name} defaultValue={params.get(name) ?? ""} maxLength={200} />
          </label>
        ))}
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
        <button type="submit">Cari alumni</button>
      </Form>
      <section aria-label="Hasil pencarian">
        <h2>Hasil pencarian</h2>
        {!profiles.length && <p>Tidak ada profil yang sesuai.</p>}
        {profiles.map((p) => (
          <article key={p.id} className="border-b py-4">
            <h3>
              <Link to={`/directory/${p.id}`}>{p.displayName || p.schoolName || "Alumni"}</Link>
            </h3>
            <p>{p.introduction}</p>
            <p>
              {p.city.join(", ")} · {p.country.join(", ")}
            </p>
            <p>
              {p.expertiseTags.map((id) => tags.find((t) => t.id === id)?.label ?? id).join(", ")}
            </p>
            <p>{p.availability ? availabilityLabels[p.availability] : ""}</p>
            {p.studentType === "graduate" ? (
              <p>Kelulusan: {p.graduationYear}</p>
            ) : p.studentType === "former-student" ? (
              <p>
                Bersekolah: {p.attendanceStart}–{p.attendanceEnd}
              </p>
            ) : null}
          </article>
        ))}
      </section>
      {nextCursor && <Link to={`?${next}`}>Halaman berikutnya</Link>}
    </main>
  );
}
