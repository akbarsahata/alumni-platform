import { Hono } from "hono";
import { getAccess, requirePrimary } from "../authorization/permissions.server";
import { listAccounts, readAudit, changeRole } from "../authorization/administration.server";
import {
  readEmailChange,
  startEmailChange,
  verifyEmailChange,
} from "../authorization/email-changes.server";

import {
  issueInvitation,
  readInvitation,
  acceptInvitation,
} from "../authorization/invitations.server";

export const administrationRoutes = new Hono<{ Bindings: Env }>()
  .post("/admin/email-changes", async (c) =>
    c.json(await startEmailChange(c.req.raw, c.env, await c.req.json().catch(() => null)))
  )
  .all("/admin/email-changes", () => new Response(null, { status: 405 }))
  .get("/email-changes/:id", async (c) =>
    c.json(await readEmailChange(c.req.raw, c.env, c.req.param("id")))
  )
  .post("/email-changes/:id", async (c) =>
    c.json(
      await verifyEmailChange(
        c.req.raw,
        c.env,
        c.req.param("id"),
        await c.req.json().catch(() => null)
      )
    )
  )
  .all("/email-changes/:id", () => new Response(null, { status: 405 }))
  .post("/admin/invitations", async (c) =>
    c.json(await issueInvitation(c.req.raw, c.env, await c.req.json().catch(() => null)))
  )
  .all("/admin/invitations", () => new Response(null, { status: 405 }))
  .get("/invitations/:id", async (c) =>
    c.json(await readInvitation(c.req.raw, c.env, c.req.param("id")))
  )
  .post("/invitations/:id", async (c) =>
    c.json(
      await acceptInvitation(
        c.req.raw,
        c.env,
        c.req.param("id"),
        await c.req.json().catch(() => null)
      )
    )
  )
  .all("/invitations/:id", () => new Response(null, { status: 405 }))
  .get("/access", async (c) => c.json(await getAccess(c.req.raw, c.env)))
  .all("/access", () => new Response(null, { status: 405 }))
  .get("/admin/roles", async (c) => {
    await requirePrimary(c.req.raw, c.env);
    return c.json({ accounts: await listAccounts(c.env) });
  })
  .post("/admin/roles", async (c) =>
    c.json(await changeRole(c.req.raw, c.env, await c.req.json().catch(() => null)))
  )
  .all("/admin/roles", () => new Response(null, { status: 405 }))
  .get("/admin/audit", async (c) => {
    await requirePrimary(c.req.raw, c.env);
    return c.json(await readAudit(c.env, c.req.query("before")));
  })
  .all("/admin/audit", () => new Response(null, { status: 405 }));
