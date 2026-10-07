import { requireDirectory } from "../authorization/permissions.server";
import { taxonomyRepository } from "../db/taxonomy.repository.server";
import { parseInput, taxonomyInput } from "../http/validation";
export async function readTaxonomy(request: Request, env: Env) {
  await requireDirectory(request, env);
  return { tags: await taxonomyRepository(env.DB).tags() };
}
export async function readTaxonomyAudit(request: Request, env: Env) {
  await requireDirectory(request, env);
  return { events: await taxonomyRepository(env.DB).audit() };
}
export async function changeTaxonomy(request: Request, env: Env, input: unknown) {
  const access = await requireDirectory(request, env);
  const change = parseInput(taxonomyInput, input, "Perubahan keahlian tidak valid.");
  const repository = taxonomyRepository(env.DB);
  const rows = await repository.change({
    id: crypto.randomUUID().replaceAll("-", ""),
    actorUserId: access.account.id,
    action: change.action,
    tagId: change.action === "add" ? crypto.randomUUID() : change.id,
    label: change.action === "retire" ? "" : change.label,
    expectedVersion: change.action === "add" ? 0 : change.expectedVersion,
    replacementId: change.action === "replace" ? crypto.randomUUID() : null,
    occurredAt: new Date().toISOString(),
  });
  if (!rows.length)
    throw new Response(
      "Keahlian atau peran berubah, atau label sudah digunakan. Muat ulang daftar.",
      { status: 409 }
    );
  return readTaxonomy(request, env);
}
