import { pageTitle } from "../content/page-title";
import { env } from "cloudflare:workers";
import { Link } from "react-router";
import type { Route } from "./+types/admin-audit";
import { requirePrimary } from "../authorization/permissions.server";
import { readAudit } from "../authorization/administration.server";
import { roleLabels, type Role } from "../authorization/roles";

export function meta() {
  return [{ title: pageTitle("Riwayat perubahan peran") }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requirePrimary(request, env);
  return readAudit(env, new URL(request.url).searchParams.get("before"));
}
const actionLabels: Record<string, string> = {
  "bootstrap-primary": "Penunjukan administrator utama",
  "bootstrap-alumnus": "Penetapan alumni tepercaya",
  "invitation-issued": "Penerbitan undangan sekolah",
  "invitation-accepted": "Penerimaan undangan sekolah",
  "email-change-requested": "Permintaan perubahan email",
  "email-change-completed": "Perubahan email selesai",
  "email-change-expired": "Verifikasi perubahan email kedaluwarsa",
  "email-change-replaced": "Permintaan perubahan email diganti",
  "email-change-collision": "Perubahan email ditolak karena alamat digunakan",
  grant: "Pemberian peran",
  revoke: "Pencabutan peran",
};
export default function AdminAudit({ loaderData }: Route.ComponentProps) {
  return (
    <main className="mx-auto max-w-3xl p-8 space-y-6">
      <h1 className="text-2xl font-semibold">Riwayat perubahan</h1>
      <Link className="underline" to="/admin/roles">
        Kelola peran
      </Link>
      <p>Riwayat penunjukan dan perubahan peran. Waktu ditampilkan dalam UTC.</p>
      <ol className="space-y-6">
        {loaderData.events.map((event) => (
          <li key={event.id} className="border rounded p-4 space-y-2">
            <p className="font-semibold">
              {actionLabels[event.action]}
              {event.role ? `: ${roleLabels[event.role as Role]}` : ""}
            </p>
            <p>Pelaku (ID akun): {event.actorUserId}</p>
            <p>Tujuan (ID akun atau email undangan): {event.targetUserId}</p>
            {event.operator && (
              <p>
                {event.action === "email-change-completed"
                  ? "Email lama → baru"
                  : event.action.startsWith("email-change")
                    ? "Pemeriksaan identitas"
                    : "Operator"}
                : {event.operator}
              </p>
            )}
            {event.house && <p>House: {event.house}</p>}
            <p>Alasan: {event.reason}</p>
            <time dateTime={event.occurredAt}>{event.occurredAt}</time>
          </li>
        ))}
      </ol>
      {loaderData.nextCursor && (
        <Link
          className="underline"
          to={`/admin/audit?before=${encodeURIComponent(loaderData.nextCursor)}`}
        >
          Riwayat sebelumnya
        </Link>
      )}
    </main>
  );
}
