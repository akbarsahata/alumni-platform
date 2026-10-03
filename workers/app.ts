import { createRequestHandler } from "react-router";
import { handleAuth, hasTrustedOrigin } from "../app/auth/auth.server";
import { readLocalMail } from "../app/email/email.server";
import { handleAuthorization } from "../app/authorization/administration.server";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE
);

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (request.method !== "GET" && request.method !== "HEAD" && !hasTrustedOrigin(request, env)) {
      return new Response("Permintaan tidak diizinkan.", { status: 403 });
    }
    if (path.startsWith("/api/auth/")) return handleAuth(request, env);
    if (path === "/api/access" || path.startsWith("/api/admin/"))
      return handleAuthorization(request, env);
    if (path === "/__local/mail") return readLocalMail(request, env);
    const response = await requestHandler(request);
    response.headers.set("Cache-Control", "no-store");
    return response;
  },
} satisfies ExportedHandler<Env>;
