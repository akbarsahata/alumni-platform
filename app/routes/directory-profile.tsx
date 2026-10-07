import { env } from "cloudflare:workers";
import { Link } from "react-router";
import type { Route } from "./+types/directory-profile";
import { searchDirectory } from "../profiles/directory.server";
import { pageTitle } from "../content/page-title";
import { helpLabels, availabilityLabels } from "../profiles/model";
export function meta() {
  return [{ title: pageTitle("Profil alumni") }];
}
export async function loader({ request, params }: Route.LoaderArgs) {
  return searchDirectory(request, env, params.userId);
}
export default function DirectoryProfile({ loaderData }: Route.ComponentProps) {
  const p = loaderData.profiles[0];
  return (
    <main className="mx-auto max-w-3xl p-8 space-y-4">
      <h1>Profil alumni</h1>
      <Link to="/directory">Direktori keahlian</Link>
      <h2>{p.displayName || p.schoolName || "Alumni"}</h2>
      <p>Nama semasa sekolah: {p.schoolName ?? "Belum tercatat"}</p>
      {p.studentType === "graduate" ? (
        <p>Tahun kelulusan: {p.graduationYear}</p>
      ) : p.studentType === "former-student" ? (
        <p>
          Tahun bersekolah: {p.attendanceStart}–{p.attendanceEnd}
        </p>
      ) : null}
      <p>{p.introduction}</p>
      <p>{p.city.join(", ")}</p>
      <p>{p.country.join(", ")}</p>
      <p>
        {p.expertiseTags
          .map((id) => loaderData.tags.find((tag) => tag.id === id)?.label ?? id)
          .join(", ")}
      </p>
      <p>{p.helpTypes.map((t) => helpLabels[t as keyof typeof helpLabels]).join(", ")}</p>
      <p>{p.availability ? availabilityLabels[p.availability] : ""}</p>
      <p>{p.availabilityNote}</p>
      <p>Konfirmasi terakhir (UTC): {p.confirmedAt}</p>
    </main>
  );
}
