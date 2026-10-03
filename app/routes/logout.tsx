import { env } from "cloudflare:workers";
import { redirect } from "react-router";
import type { Route } from "./+types/logout";
import { authFormRequest, handleAuth } from "../auth/auth.server";

export async function action({ request }: Route.ActionArgs) {
  const response = await handleAuth(authFormRequest(request, "/api/auth/sign-out", {}), env);
  if (!response.ok) throw new Response("Tidak dapat keluar. Silakan coba lagi.", { status: response.status });
  return redirect("/login", { headers: response.headers });
}
export function loader() {
  return new Response(null, { status: 405 });
}
