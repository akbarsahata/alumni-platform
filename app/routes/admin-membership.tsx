import { pageTitle } from "../content/page-title";
import { env } from "cloudflare:workers";
import { Link } from "react-router";
import type { Route } from "./+types/admin-membership";
import { reviewQueue } from "../membership/applications.server";

export function meta() {
  return [{ title: pageTitle("Tinjau keanggotaan") }];
}

export async function loader({ request }: Route.LoaderArgs) {
  return await reviewQueue(request, env);
}
export default function MembershipQueue({ loaderData }: Route.ComponentProps) {
  return (
    <main className="mx-auto max-w-3xl p-8 space-y-6">
      <h1 className="text-2xl font-semibold">Tinjau keanggotaan</h1>
      <Link to="/" className="underline">
        Beranda
      </Link>
      <p>
        Pengajuan menunggu tinjauan manual. Keputusan memerlukan pemeriksaan independen melalui
        alumni tepercaya atau staf sekolah.
      </p>
      {loaderData.applications.length === 0 ? (
        <p>Tidak ada pengajuan dalam antrean ini.</p>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>Nama semasa sekolah</th>
              <th>House</th>
              <th>Versi</th>
            </tr>
          </thead>
          <tbody>
            {loaderData.applications.map((application) => (
              <tr key={application.userId}>
                <td className="p-2">
                  <Link
                    className="underline"
                    to={`/admin/membership/${encodeURIComponent(application.userId)}`}
                  >
                    {application.schoolName}
                  </Link>
                </td>
                <td>{application.house}</td>
                <td>{application.revision}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {loaderData.nextCursor && (
        <Link className="underline" to={`?after=${encodeURIComponent(loaderData.nextCursor)}`}>
          Halaman berikutnya
        </Link>
      )}
    </main>
  );
}
