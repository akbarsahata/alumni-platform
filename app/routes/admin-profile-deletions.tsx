import { env } from "cloudflare:workers";
import { Link } from "react-router";
import type { Route } from "./+types/admin-profile-deletions";
import { readProfileDeletionQueue } from "../deletion/profile-deletion.server";
import { pageTitle } from "../content/page-title";
import { LocalTimestamp } from "../components/local-timestamp";

export function meta() {
  return [{ title: pageTitle("Penghapusan profil") }];
}

export async function loader({ request }: Route.LoaderArgs) {
  return readProfileDeletionQueue(request, env);
}

function RequestRow({
  request,
}: {
  request: Awaited<ReturnType<typeof readProfileDeletionQueue>>["active"][number];
}) {
  return (
    <li className="space-y-1 rounded border p-4">
      <p className="font-semibold">
        <Link className="underline" to={`/admin/profile-deletions/${request.id}`}>
          {request.schoolName || "Nama sekolah tidak tercatat"}
        </Link>
      </p>
      <p>House: {request.house ?? "Tidak tercatat"}</p>
      <p>ID akun: {request.memberUserId}</p>
      <p>
        Diajukan: <LocalTimestamp value={request.requestedAt} />
      </p>
      <p>
        Target selesai: <LocalTimestamp value={request.dueAt} />
      </p>
      {request.status === "active" ? (
        <p role="status">
          {request.overdue ? "Terlambat dari target 30 hari." : "Dalam target 30 hari."} Konten
          profil: {request.steps.profileRemoved ? "selesai" : "belum"}. Teks klarifikasi:{" "}
          {request.steps.clarificationRemoved ? "selesai" : "belum"}.
        </p>
      ) : (
        <p role="status">
          Selesai: <LocalTimestamp value={request.completedAt!} />
          {request.completedLate ? " — setelah target 30 hari." : "."}
        </p>
      )}
    </li>
  );
}

export default function AdminProfileDeletions({ loaderData }: Route.ComponentProps) {
  return (
    <main className="mx-auto max-w-3xl space-y-6 break-words p-4">
      <h1 className="text-2xl font-semibold">Penghapusan profil</h1>
      <p>
        Antrean pemrosesan manual penghapusan profil direktori. Halaman ini hanya memberi akses
        penghapusan dan tidak membuka pencarian direktori, profil, atau percakapan klarifikasi.
      </p>
      <p>
        Waktu ditampilkan dalam zona waktu browser. Batas target adalah 30 hari kalender setelah
        permintaan.
      </p>
      <section aria-label="Permintaan aktif" className="space-y-3">
        <h2 className="text-xl font-semibold">Aktif</h2>
        {loaderData.active.length ? (
          <ol className="space-y-3">
            {loaderData.active.map((request) => (
              <RequestRow key={request.id} request={request} />
            ))}
          </ol>
        ) : (
          <p>Tidak ada permintaan aktif.</p>
        )}
      </section>
      <section aria-label="Permintaan selesai" className="space-y-3">
        <h2 className="text-xl font-semibold">Selesai</h2>
        {loaderData.completed.length ? (
          <ol className="space-y-3">
            {loaderData.completed.map((request) => (
              <RequestRow key={request.id} request={request} />
            ))}
          </ol>
        ) : (
          <p>Belum ada permintaan yang selesai.</p>
        )}
      </section>
    </main>
  );
}
