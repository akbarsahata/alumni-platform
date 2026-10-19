import { env } from "cloudflare:workers";
import { Link } from "react-router";
import type { Route } from "./+types/outreach";
import { readOutreach } from "../outreach/outreach.server";
import { outreachStatusLabels } from "../outreach/model";
import { pageTitle } from "../content/page-title";
export function meta() {
  return [{ title: pageTitle("Permintaan bantuan") }];
}
export async function loader({ request }: Route.LoaderArgs) {
  return readOutreach(request, env);
}
export default function Outreach({ loaderData: d }: Route.ComponentProps) {
  const requestsNext = new URLSearchParams();
  if (d.needsAfter) requestsNext.set("needsAfter", d.needsAfter);
  if (d.requestsNextCursor) requestsNext.set("requestsAfter", d.requestsNextCursor);
  const needsNext = new URLSearchParams();
  if (d.requestsAfter) needsNext.set("requestsAfter", d.requestsAfter);
  if (d.needsNextCursor) needsNext.set("needsAfter", d.needsNextCursor);
  return (
    <main className="mx-auto max-w-4xl space-y-6">
      <h1>Permintaan bantuan</h1>
      <section className="space-y-3">
        <h2>Permintaan untuk Anda</h2>
        <p>
          Anda dapat menyatakan minat atau menolak secara pribadi. Minat tidak membagikan email
          Anda.
        </p>
        {!d.requests.length && <p>Belum ada permintaan.</p>}
        {d.requests.map((r) => (
          <article className="rounded border p-4" key={r.id}>
            <Link to={`/outreach/requests/${r.id}`}>{r.title}</Link>
            <p>
              {outreachStatusLabels[r.status]} · Batas respons (UTC): {r.expiresAt}
            </p>
          </article>
        ))}
        {d.requestsNextCursor && <Link to={`?${requestsNext}`}>Permintaan berikutnya</Link>}
      </section>
      {d.isCoordinator && (
        <section className="space-y-3">
          <h2>Penjangkauan sekolah</h2>
          <p>
            Pilih kebutuhan yang disetujui untuk memilih penerima atau melanjutkan penjangkauan.
          </p>
          <Link to="/school-needs">Kebutuhan sekolah</Link>
          {!d.needs.length && <p>Belum ada kebutuhan yang tersedia.</p>}
          {d.needs.map((n) => (
            <article className="rounded border p-4" key={n.id}>
              <Link to={`/outreach/needs/${n.id}`}>{n.title}</Link>
            </article>
          ))}
          {d.needsNextCursor && <Link to={`?${needsNext}`}>Kebutuhan berikutnya</Link>}
        </section>
      )}
    </main>
  );
}
