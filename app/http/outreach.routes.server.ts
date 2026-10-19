import { Hono } from "hono";
import {
  sendOutreach,
  readOutreachNeed,
  readOutreachRequest,
  respondOutreach,
  deliverOutreach,
  closeOutreachNeed,
  takeOverOutreach,
  readOutreachAudit,
  remindOutreach,
  readOutreach,
} from "../outreach/outreach.server";
export const outreachRoutes = new Hono<{ Bindings: Env }>()
  .get("/", async (c) => c.json(await readOutreach(c.req.raw, c.env)))
  .all("/", () => new Response(null, { status: 405 }))
  .get("/audit", async (c) => c.json(await readOutreachAudit(c.req.raw, c.env)))
  .all("/audit", () => new Response(null, { status: 405 }))
  .post("/requests/:requestId/remind", async (c) =>
    c.json(
      await remindOutreach(
        c.req.raw,
        c.env,
        c.req.param("requestId"),
        await c.req.json().catch(() => null)
      )
    )
  )
  .all("/requests/:requestId/remind", () => new Response(null, { status: 405 }))
  .post("/requests/:requestId/take-over", async (c) =>
    c.json(
      await takeOverOutreach(
        c.req.raw,
        c.env,
        c.req.param("requestId"),
        await c.req.json().catch(() => null)
      )
    )
  )
  .all("/requests/:requestId/take-over", () => new Response(null, { status: 405 }))
  .post("/needs/:needId/close", async (c) =>
    c.json(
      await closeOutreachNeed(
        c.req.raw,
        c.env,
        c.req.param("needId"),
        await c.req.json().catch(() => null)
      )
    )
  )
  .all("/needs/:needId/close", () => new Response(null, { status: 405 }))
  .get("/needs/:needId", async (c) =>
    c.json(await readOutreachNeed(c.req.raw, c.env, c.req.param("needId")))
  )
  .all("/needs/:needId", () => new Response(null, { status: 405 }))
  .post("/needs/:needId/send", async (c) =>
    c.json(
      await sendOutreach(
        c.req.raw,
        c.env,
        c.req.param("needId"),
        await c.req.json().catch(() => null)
      )
    )
  )
  .all("/needs/:needId/send", () => new Response(null, { status: 405 }))
  .get("/requests/:requestId", async (c) =>
    c.json(await readOutreachRequest(c.req.raw, c.env, c.req.param("requestId")))
  )
  .all("/requests/:requestId", () => new Response(null, { status: 405 }))
  .post("/requests/:requestId/respond", async (c) =>
    c.json(
      await respondOutreach(
        c.req.raw,
        c.env,
        c.req.param("requestId"),
        await c.req.json().catch(() => null)
      )
    )
  )
  .all("/requests/:requestId/respond", () => new Response(null, { status: 405 }))
  .post("/requests/:requestId/deliver", async (c) =>
    c.json(
      await deliverOutreach(
        c.req.raw,
        c.env,
        c.req.param("requestId"),
        await c.req.json().catch(() => null)
      )
    )
  )
  .all("/requests/:requestId/deliver", () => new Response(null, { status: 405 }));
