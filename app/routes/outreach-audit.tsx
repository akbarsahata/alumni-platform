import { env } from "cloudflare:workers";
import { Link } from "react-router";
import type { Route } from "./+types/outreach-audit";
import { readOutreachAudit } from "../outreach/outreach.server";
import { pageTitle } from "../content/page-title";
export function meta() {
  return [{ title: pageTitle("Audit penjangkauan") }];
}
export async function loader({ request }: Route.LoaderArgs) {
  return readOutreachAudit(request, env);
}
const labels: Record<string, string> = {
  "request-sent": "Permintaan dikirim",
  "assignment-changed": "Koordinator berganti",
  "reminder-requested": "Pengingat diminta",
  "need-closed": "Kebutuhan ditutup",
  interested: "Respons berminat",
  declined: "Respons menolak",
  cancelled: "Permintaan dibatalkan",
};
export default function OutreachAudit({ loaderData: d }: Route.ComponentProps) {
  return (
    <main className="mx-auto max-w-3xl space-y-5 break-all">
      <h1>Audit penjangkauan</h1>
      <p>Riwayat tindakan dengan ID akun dan waktu UTC.</p>
      <ol className="space-y-3">
        {d.events.map((e) => (
          <li className="border rounded p-4" key={e.id}>
            <p>{labels[e.action] ?? e.action}</p>
            <p>Kebutuhan: {e.needId}</p>
            <p>Pelaku: {e.actorUserId ?? "Sistem"}</p>
            <time>{e.occurredAt}</time>
          </li>
        ))}
      </ol>
      {d.nextCursor && <Link to={`?after=${d.nextCursor}`}>Riwayat berikutnya</Link>}
    </main>
  );
}
