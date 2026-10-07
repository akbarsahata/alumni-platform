import { Hono } from "hono";
import { readProfile, saveProfile } from "../profiles/profiles.server";
export const profileRoutes = new Hono<{ Bindings: Env }>()
  .get("/", async (c) => c.json(await readProfile(c.req.raw, c.env)))
  .post("/", async (c) =>
    c.json(await saveProfile(c.req.raw, c.env, await c.req.json().catch(() => null)))
  )
  .all("/", () => new Response(null, { status: 405 }))
  .post("/confirm", async (c) =>
    c.json(await saveProfile(c.req.raw, c.env, await c.req.json().catch(() => null), true))
  )
  .all("/confirm", () => new Response(null, { status: 405 }));
