import { apiMethodPolicy } from "../app/http/methods.server";
import { createRequestHandler } from "react-router";
import { Hono } from "hono";
import { handleAuth } from "../app/auth/auth.server";
import { readLocalMail } from "../app/email/email.server";
import { requestPolicy } from "../app/http/middleware.server";
import { administrationRoutes } from "../app/http/administration.routes.server";
import { membershipRoutes } from "../app/http/membership.routes.server";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE
);
const app = new Hono<{ Bindings: Env }>();
app.use("*", requestPolicy);
app.use("/api/*", apiMethodPolicy);
app.all("/api/auth/*", (c) => handleAuth(c.req.raw, c.env));
app.route("/api", administrationRoutes);
app.route("/api/membership", membershipRoutes);
app.all("/api/*", () => new Response(null, { status: 404 }));
app.all("/__local/mail", (c) => readLocalMail(c.req.raw, c.env));
app.all("*", (c) => requestHandler(c.req.raw));
export default { fetch: app.fetch } satisfies ExportedHandler<Env>;
