import { Hono } from "hono";
import {
  approveSchoolNeed,
  editSchoolNeed,
  readSchoolNeed,
  readSchoolNeeds,
  submitSchoolNeed,
  validateSchoolNeed,
} from "../school-needs/school-needs.server";

export const schoolNeedsRoutes = new Hono<{ Bindings: Env }>()
  .get("/", async (c) => c.json(await readSchoolNeeds(c.req.raw, c.env)))
  .post("/", async (c) =>
    c.json(await submitSchoolNeed(c.req.raw, c.env, await c.req.json().catch(() => null)))
  )
  .all("/", () => new Response(null, { status: 405 }))
  .get("/:needId", async (c) =>
    c.json(await readSchoolNeed(c.req.raw, c.env, c.req.param("needId")))
  )
  .all("/:needId", () => new Response(null, { status: 405 }))
  .post("/:needId/edit", async (c) =>
    c.json(
      await editSchoolNeed(
        c.req.raw,
        c.env,
        c.req.param("needId"),
        await c.req.json().catch(() => null)
      )
    )
  )
  .all("/:needId/edit", () => new Response(null, { status: 405 }))
  .post("/:needId/validate", async (c) =>
    c.json(
      await validateSchoolNeed(
        c.req.raw,
        c.env,
        c.req.param("needId"),
        await c.req.json().catch(() => null)
      )
    )
  )
  .all("/:needId/validate", () => new Response(null, { status: 405 }))
  .post("/:needId/approve", async (c) =>
    c.json(
      await approveSchoolNeed(
        c.req.raw,
        c.env,
        c.req.param("needId"),
        await c.req.json().catch(() => null)
      )
    )
  )
  .all("/:needId/approve", () => new Response(null, { status: 405 }));
