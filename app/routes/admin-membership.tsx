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
      <Link to="/admin/email-changes" className="underline">
        Bantu perubahan email
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
      <section className="space-y-4">
        <h2>Anggota dan tinjauan penangguhan</h2>
        {loaderData.members.map((member) => (
          <article key={member.userId}>
            <Link to={`/admin/membership/${encodeURIComponent(member.userId)}`}>
              Tinjau anggota {member.userId}
            </Link>
            <p>
              {member.status === "suspended" ? "Ditangguhkan" : "Disetujui"} · {member.house}
            </p>
            {member.requestedAt && <p>Permintaan tinjauan menunggu pemeriksa</p>}
          </article>
        ))}
        {loaderData.memberNextCursor && (
          <Link to={`?after=${encodeURIComponent(loaderData.memberNextCursor)}`}>
            Anggota berikutnya
          </Link>
        )}
      </section>
      {loaderData.nextCursor && (
        <Link className="underline" to={`?after=${encodeURIComponent(loaderData.nextCursor)}`}>
          Halaman berikutnya
        </Link>
      )}
    </main>
  );
}
