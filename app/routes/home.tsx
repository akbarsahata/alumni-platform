import { pageTitle } from "../content/page-title";
import { alumniMessages } from "../content/alumni-messages";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { env } from "cloudflare:workers";
import { Form, Link } from "react-router";
import type { Route } from "./+types/home";
import { getAccount } from "../auth/auth.server";
import { getAccess } from "../authorization/permissions.server";

export function meta() {
  return [{ title: pageTitle() }];
}
export async function loader({ request }: Route.LoaderArgs) {
  const account = await getAccount(request, env);
  return { account, access: account ? await getAccess(request, env) : null };
}
export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <main className="home-page mx-auto max-w-xl p-8 space-y-6">
      <div className="home-intro">
        <p className="eyebrow" lang="en">
          {alumniMessages.home.eyebrow}
        </p>
        <h1 lang="en">
          {alumniMessages.home.headline[0]}
          <br />
          {alumniMessages.home.headline[1]}
          <br />
          <em>{alumniMessages.home.headline[2]}</em>
        </h1>
        <p className="intro-copy">{alumniMessages.home.introduction}</p>
        <div className="school-ribbon">
          <span aria-hidden="true">✦</span> Palembang, Sumatera Selatan
        </div>
      </div>
      <Card className="home-account gap-0">
        <p className="eyebrow">KELUARGA ALUMNI</p>
        <h2 lang={loaderData.account ? "id" : "en"}>
          {loaderData.account ? "Selamat datang kembali." : alumniMessages.home.welcome}
        </h2>
        {loaderData.account ? (
          <>
            <p>Anda masuk sebagai {loaderData.account.email}.</p>
            <p>Email Anda telah diverifikasi. Status keanggotaan ditinjau secara terpisah.</p>
            <Link className="action-link" to="/membership">
              Pengajuan keanggotaan <span aria-hidden="true">→</span>
            </Link>
            {loaderData.access?.permissions.reviewMembership && (
              <Link className="action-link" to="/admin/membership">
                Tinjau keanggotaan <span aria-hidden="true">→</span>
              </Link>
            )}
            {loaderData.access?.permissions.manageRoles && (
              <Link className="action-link" to="/admin/roles">
                Kelola peran <span aria-hidden="true">→</span>
              </Link>
            )}
            <Form method="post" action="/logout">
              <Button type="submit" className="border rounded px-4 py-2">
                Keluar
              </Button>
            </Form>
          </>
        ) : (
          <>
            <p>Mulai dengan email Anda untuk bergabung dan mengajukan keanggotaan alumni.</p>
            <Link className="primary-link" to="/login">
              Masuk dengan kode email
            </Link>
            <p className="quiet-copy" lang="en">
              {alumniMessages.home.family}
            </p>
          </>
        )}
      </Card>
    </main>
  );
}
