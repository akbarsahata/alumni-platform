import type { MiddlewareHandler } from "hono";
import { hasTrustedOrigin } from "../auth/auth.server";

export const requestPolicy: MiddlewareHandler<{ Bindings: Env }> = async (context, next) => {
  try {
    if (
      !["GET", "HEAD"].includes(context.req.method) &&
      !hasTrustedOrigin(context.req.raw, context.env)
    )
      return new Response("Permintaan tidak diizinkan.", {
        status: 403,
        headers: { "Cache-Control": "no-store" },
      });
    await next();
  } catch (error) {
    if (!(error instanceof Response)) throw error;
    context.res = error;
  }
  context.header("Cache-Control", "no-store");
};
