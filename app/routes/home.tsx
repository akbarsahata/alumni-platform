import { env } from "cloudflare:workers";
import { Form, Link } from "react-router";
import type { Route } from "./+types/home";
import { getAccount } from "../auth/auth.server";
import { getAccess } from "../authorization/permissions.server";

export function meta() {
  return [{ title: "Komunitas alumni" }];
}
export async function loader({ request }: Route.LoaderArgs) {
  const account = await getAccount(request, env);
  return { account, access: account ? await getAccess(request, env) : null };
}
export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <main className="mx-auto max-w-xl p-8 space-y-6">
      <h1 className="text-2xl font-semibold">Komunitas alumni</h1>
      {loaderData.account ? (
        <>
          <p>Anda masuk sebagai {loaderData.account.email}.</p>
          <p>Email Anda telah diverifikasi. Status keanggotaan ditinjau secara terpisah.</p>
          <Link className="underline block" to="/membership">
            Pengajuan keanggotaan
          </Link>
          {loaderData.access?.permissions.reviewMembership && (
            <Link className="underline block" to="/admin/membership">
              Tinjau keanggotaan
            </Link>
          )}
          {loaderData.access?.permissions.manageRoles && (
            <Link className="underline" to="/admin/roles">
              Kelola peran
            </Link>
          )}
          <Form method="post" action="/logout">
            <button className="border rounded px-4 py-2">Keluar</button>
          </Form>
        </>
      ) : (
        <Link className="underline" to="/login">
          Masuk dengan kode email
        </Link>
      )}
    </main>
  );
}
