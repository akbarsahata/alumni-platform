import { env } from "cloudflare:workers";
import { Link } from "react-router";
import type { Route } from "./+types/admin-audit";
import { requirePrimary } from "../authorization/permissions.server";
import { readAudit } from "../authorization/administration.server";
import { roleLabels, type Role } from "../authorization/roles";

export async function loader({ request }: Route.LoaderArgs) {
  await requirePrimary(request, env);
  return readAudit(env, new URL(request.url).searchParams.get("before"));
}
const actionLabels: Record<string, string> = {
  "bootstrap-primary": "Penunjukan administrator utama",
  "bootstrap-alumnus": "Penetapan alumni tepercaya",
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
            <p>Akun tujuan (ID): {event.targetUserId}</p>
            {event.operator && <p>Operator: {event.operator}</p>}
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
