import { env } from "cloudflare:workers";
import { Form, Link, data, useNavigation } from "react-router";
import type { Route } from "./+types/directory-tags";
import { readTaxonomy, readTaxonomyAudit, changeTaxonomy } from "../profiles/taxonomy.server";
import { requireDirectory } from "../authorization/permissions.server";
import { pageTitle } from "../content/page-title";
export function meta() {
  return [{ title: pageTitle("Kelola keahlian") }];
}
export async function loader({ request }: Route.LoaderArgs) {
  const taxonomy = await readTaxonomy(request, env);
  return { ...taxonomy, ...(await readTaxonomyAudit(request, env)) };
}
export async function action({ request }: Route.ActionArgs) {
  await requireDirectory(request, env);
  try {
    await changeTaxonomy(request, env, Object.fromEntries(await request.formData()));
    return { error: null, message: "Daftar keahlian diperbarui." };
  } catch (e) {
    if (!(e instanceof Response) || ![400, 409].includes(e.status)) throw e;
    return data({ error: await e.text(), message: null }, { status: e.status });
  }
}
const actionLabels: Record<string, string> = {
  add: "Ditambahkan",
  rename: "Label diubah",
  retire: "Dihentikan",
  replace: "Diganti",
};
export default function Tags({ loaderData, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== "idle";
  return (
    <main className="mx-auto max-w-3xl p-8 space-y-6">
      <h1>Kelola keahlian</h1>
      <Link to="/directory">Direktori keahlian</Link>
      <p>
        Ubah label hanya jika maknanya tetap. Perubahan makna memerlukan keahlian pengganti yang
        dipilih sendiri oleh anggota. Penghentian mempertahankan pilihan anggota.
      </p>
      {actionData?.error && <p role="alert">{actionData.error}</p>}
      {actionData?.message && <p role="status">{actionData.message}</p>}
      <Form method="post">
        <input type="hidden" name="action" value="add" />
        <label>
          Keahlian baru
          <input name="label" required maxLength={100} />
        </label>
        <button disabled={busy}>Tambah keahlian</button>
      </Form>
      {loaderData.tags.map((tag) => (
        <section key={`${tag.id}-${tag.version}`} aria-label={tag.label} className="border-b py-4">
          <h2>
            {tag.label}
            {tag.retired ? " (dihentikan)" : ""}
          </h2>
          {tag.replacementId && (
            <p>Pengganti: {loaderData.tags.find((t) => t.id === tag.replacementId)?.label}</p>
          )}
          {!tag.retired && (
            <>
              <Form method="post">
                <input type="hidden" name="id" value={tag.id} />
                <input type="hidden" name="expectedVersion" value={tag.version} />
                <label>
                  Label keahlian
                  <input name="label" defaultValue={tag.label} required maxLength={100} />
                </label>
                <button disabled={busy} name="action" value="rename">
                  Ubah label
                </button>
                <button disabled={busy} name="action" value="replace">
                  Buat pengganti
                </button>
              </Form>
              <Form method="post">
                <input type="hidden" name="id" value={tag.id} />
                <input type="hidden" name="expectedVersion" value={tag.version} />
                <input type="hidden" name="action" value="retire" />
                <button disabled={busy}>Hentikan keahlian</button>
              </Form>
            </>
          )}
        </section>
      ))}
      <section aria-label="Riwayat keahlian">
        <h2>Riwayat keahlian</h2>
        <p>100 perubahan terakhir; waktu UTC.</p>
        {loaderData.events.map((event) => (
          <p key={event.id}>
            {actionLabels[event.action]} · {event.actorUserId} · {event.occurredAt}
          </p>
        ))}
      </section>
    </main>
  );
}
