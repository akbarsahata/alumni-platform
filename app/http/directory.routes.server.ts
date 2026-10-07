import { readTaxonomy, readTaxonomyAudit, changeTaxonomy } from "../profiles/taxonomy.server";
import { Hono } from "hono";
import { searchDirectory } from "../profiles/directory.server";
export const directoryRoutes = new Hono<{ Bindings: Env }>()
  .get("/", async (c) => c.json(await searchDirectory(c.req.raw, c.env)))
  .all("/", () => new Response(null, { status: 405 }))
  .get("/tags", async (c) => c.json(await readTaxonomy(c.req.raw, c.env)))
  .post("/tags", async (c) =>
    c.json(await changeTaxonomy(c.req.raw, c.env, await c.req.json().catch(() => null)))
  )
  .all("/tags", () => new Response(null, { status: 405 }))
  .get("/tags/audit", async (c) => c.json(await readTaxonomyAudit(c.req.raw, c.env)))
  .all("/tags/audit", () => new Response(null, { status: 405 }))
  .get("/:userId", async (c) =>
    c.json(await searchDirectory(c.req.raw, c.env, c.req.param("userId")))
  )
  .all("/:userId", () => new Response(null, { status: 405 }));
