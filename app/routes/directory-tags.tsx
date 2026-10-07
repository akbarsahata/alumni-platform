import { Plus, Pencil, ArrowRightLeft, Archive } from "lucide-react";
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
    <main className="directory-page taxonomy-page mx-auto max-w-3xl space-y-5">
      <h1>Kelola keahlian</h1>
      <Link to="/directory">Direktori keahlian</Link>
      <p>
        Ubah label hanya jika maknanya tetap. Perubahan makna memerlukan keahlian pengganti yang
        dipilih sendiri oleh anggota. Penghentian mempertahankan pilihan anggota.
      </p>
      {actionData?.error && <p role="alert">{actionData.error}</p>}
      {actionData?.message && <p role="status">{actionData.message}</p>}
      <Form method="post" className="taxonomy-form">
        <input type="hidden" name="action" value="add" />
        <label>
          Keahlian baru
          <input name="label" required maxLength={100} />
        </label>
        <button
          className="directory-icon-action"
          aria-label="Tambah keahlian"
          title="Tambah keahlian"
          disabled={busy}
        >
          <Plus size={18} aria-hidden="true" />
        </button>
      </Form>
      {loaderData.tags.map((tag) => (
        <section key={`${tag.id}-${tag.version}`} aria-label={tag.label} className="taxonomy-card">
          <h2>
            {tag.label}
            {tag.retired ? " (dihentikan)" : ""}
          </h2>
          {tag.replacementId && (
            <p>Pengganti: {loaderData.tags.find((t) => t.id === tag.replacementId)?.label}</p>
          )}
          {!tag.retired && (
            <div className="taxonomy-editor">
              <Form method="post" id={`tag-edit-${tag.id}`}>
                <input type="hidden" name="id" value={tag.id} />
                <input type="hidden" name="expectedVersion" value={tag.version} />
                <label>
                  Label keahlian
                  <input name="label" defaultValue={tag.label} required maxLength={100} />
                </label>
              </Form>
              <div className="taxonomy-actions">
                <button
                  className="directory-icon-action"
                  form={`tag-edit-${tag.id}`}
                  disabled={busy}
                  name="action"
                  value="rename"
                  aria-label="Ubah label"
                  title="Ubah label"
                >
                  <Pencil size={18} aria-hidden="true" />
                </button>
                <button
                  className="directory-icon-action"
                  form={`tag-edit-${tag.id}`}
                  disabled={busy}
                  name="action"
                  value="replace"
                  aria-label="Buat pengganti"
                  title="Buat pengganti"
                >
                  <ArrowRightLeft size={18} aria-hidden="true" />
                </button>
                <Form method="post">
                  <input type="hidden" name="id" value={tag.id} />
                  <input type="hidden" name="expectedVersion" value={tag.version} />
                  <input type="hidden" name="action" value="retire" />
                  <button
                    className="directory-icon-action taxonomy-retire"
                    disabled={busy}
                    aria-label="Hentikan keahlian"
                    title="Hentikan keahlian"
                  >
                    <Archive size={18} aria-hidden="true" />
                  </button>
                </Form>
              </div>
            </div>
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
