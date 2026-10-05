import type { MiddlewareHandler } from "hono";
import { matchedRoutes } from "hono/route";

// Hono dispatches HEAD through GET. Existing API contracts require an explicit 405.
export const apiMethodPolicy: MiddlewareHandler<{ Bindings: Env }> = async (context, next) => {
  if (
    context.req.method === "HEAD" &&
    matchedRoutes(context).some((route) => route.method === "GET")
  )
    return new Response(null, { status: 405 });
  await next();
};
