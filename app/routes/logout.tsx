import { Button } from "../components/ui/button";
import { env } from "cloudflare:workers";
import { Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/logout";
import { authFormRequest, handleAuth } from "../auth/auth.server";

export async function action({ request }: Route.ActionArgs) {
  const response = await handleAuth(authFormRequest(request, "/api/auth/sign-out", {}), env);
  if (!response.ok)
    throw new Response("Tidak dapat keluar. Silakan coba lagi.", {
      status: response.status,
    });
  return redirect("/login", { headers: response.headers });
}
export function loader() {
  return null;
}

export default function Logout() {
  const busy = useNavigation().state !== "idle";
  return (
    <main className="mx-auto max-w-xl p-8 space-y-6">
      <h1 className="text-2xl font-semibold">Keluar dari akun</h1>
      <p>Konfirmasi untuk mengakhiri sesi akun di perangkat ini.</p>
      <Form method="post">
        <Button type="submit" disabled={busy} className="border rounded px-4 py-2">
          Keluar
        </Button>
      </Form>
      <Link to="/" className="underline">
        Kembali ke beranda
      </Link>
    </main>
  );
}
