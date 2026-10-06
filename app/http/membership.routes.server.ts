import { decideMembershipStatus, requestSuspensionReview } from "../membership/suspensions.server";
import { Hono } from "hono";
import { getAccess } from "../authorization/permissions.server";
import {
  readApplication,
  submitApplication,
  reviewQueue,
  reviewDetails,
  decideApplication,
  correctApprovedHouse,
} from "../membership/applications.server";
import {
  recoverReference,
  requestReference,
  readReference,
  respondReference,
} from "../membership/references.server";

export const membershipRoutes = new Hono<{ Bindings: Env }>()
  .post("/suspension-review", async (c) =>
    c.json(await requestSuspensionReview(c.req.raw, c.env, await c.req.json().catch(() => null)))
  )
  .all("/suspension-review", () => new Response(null, { status: 405 }))
  .post("/reviews/:userId/status", async (c) =>
    c.json(
      await decideMembershipStatus(
        c.req.raw,
        c.env,
        c.req.param("userId"),
        await c.req.json().catch(() => null)
      )
    )
  )
  .all("/reviews/:userId/status", () => new Response(null, { status: 405 }))
  .get("/application", async (c) => {
    const { account } = await getAccess(c.req.raw, c.env);
    return c.json(await readApplication(c.env, account.id));
  })
  .post("/application", async (c) =>
    c.json(await submitApplication(c.req.raw, c.env, await c.req.json().catch(() => null)))
  )
  .all("/application", () => new Response(null, { status: 405 }))
  .get("/reviews", async (c) => c.json(await reviewQueue(c.req.raw, c.env)))
  .all("/reviews", () => new Response(null, { status: 405 }))
  .post("/reviews/:userId/house-correction", async (c) =>
    c.json(
      await correctApprovedHouse(
        c.req.raw,
        c.env,
        c.req.param("userId"),
        await c.req.json().catch(() => null)
      )
    )
  )
  .all("/reviews/:userId/house-correction", () => new Response(null, { status: 405 }))
  .get("/reviews/:userId", async (c) =>
    c.json(await reviewDetails(c.req.raw, c.env, c.req.param("userId")))
  )
  .post("/reviews/:userId", async (c) =>
    c.json(
      await decideApplication(
        c.req.raw,
        c.env,
        c.req.param("userId"),
        await c.req.json().catch(() => null)
      )
    )
  )
  .all("/reviews/:userId", () => new Response(null, { status: 405 }))
  .post("/reference-replacement", async (c) =>
    c.json(await recoverReference(c.req.raw, c.env, await c.req.json().catch(() => null)))
  )
  .all("/reference-replacement", () => new Response(null, { status: 405 }))
  .post("/manual-review", async (c) =>
    c.json(await recoverReference(c.req.raw, c.env, await c.req.json().catch(() => null), true))
  )
  .all("/manual-review", () => new Response(null, { status: 405 }))
  .post("/references", async (c) =>
    c.json(await requestReference(c.req.raw, c.env, await c.req.json().catch(() => null)))
  )
  .all("/references", () => new Response(null, { status: 405 }))
  .get("/references/:requestId", async (c) =>
    c.json(await readReference(c.req.raw, c.env, c.req.param("requestId")))
  )
  .post("/references/:requestId", async (c) =>
    c.json(
      await respondReference(
        c.req.raw,
        c.env,
        c.req.param("requestId"),
        await c.req.json().catch(() => null)
      )
    )
  )
  .all("/references/:requestId", () => new Response(null, { status: 405 }));
