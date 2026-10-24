import { Hono } from "hono";
import {
  completeProfileDeletion,
  readProfileDeletion,
  readProfileDeletionQueue,
  readProfileDeletionRequest,
  removeClarificationContent,
  removeProfileContent,
  requestProfileDeletion,
} from "../deletion/profile-deletion.server";

export const profileDeletionRoutes = new Hono<{ Bindings: Env }>()
  .get("/profile/deletion", async (c) => c.json(await readProfileDeletion(c.req.raw, c.env)))
  .post("/profile/deletion", async (c) =>
    c.json(await requestProfileDeletion(c.req.raw, c.env, await c.req.json().catch(() => null)))
  )
  .all("/profile/deletion", () => new Response(null, { status: 405 }))
  .get("/admin/profile-deletions", async (c) =>
    c.json(await readProfileDeletionQueue(c.req.raw, c.env))
  )
  .all("/admin/profile-deletions", () => new Response(null, { status: 405 }))
  .post("/admin/profile-deletions/:requestId/profile-removal", async (c) =>
    c.json(
      await removeProfileContent(
        c.req.raw,
        c.env,
        c.req.param("requestId"),
        await c.req.json().catch(() => null)
      )
    )
  )
  .all(
    "/admin/profile-deletions/:requestId/profile-removal",
    () => new Response(null, { status: 405 })
  )
  .post("/admin/profile-deletions/:requestId/clarification-removal", async (c) =>
    c.json(
      await removeClarificationContent(
        c.req.raw,
        c.env,
        c.req.param("requestId"),
        await c.req.json().catch(() => null)
      )
    )
  )
  .all(
    "/admin/profile-deletions/:requestId/clarification-removal",
    () => new Response(null, { status: 405 })
  )
  .post("/admin/profile-deletions/:requestId/complete", async (c) =>
    c.json(
      await completeProfileDeletion(
        c.req.raw,
        c.env,
        c.req.param("requestId"),
        await c.req.json().catch(() => null)
      )
    )
  )
  .all("/admin/profile-deletions/:requestId/complete", () => new Response(null, { status: 405 }))
  .get("/admin/profile-deletions/:requestId", async (c) =>
    c.json(await readProfileDeletionRequest(c.req.raw, c.env, c.req.param("requestId")))
  )
  .all("/admin/profile-deletions/:requestId", () => new Response(null, { status: 405 }));
