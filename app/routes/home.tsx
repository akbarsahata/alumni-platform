import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { env } from "cloudflare:workers";
import { Form, Link } from "react-router";
import type { Route } from "./+types/home";
import { getAccount } from "../auth/auth.server";
import { getAccess } from "../authorization/permissions.server";

export function meta() {
  return [{ title: "Keluarga alumni" }];
}
export async function loader({ request }: Route.LoaderArgs) {
  const account = await getAccount(request, env);
  return { account, access: account ? await getAccess(request, env) : null };
}
export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <main className="home-page mx-auto max-w-xl p-8 space-y-6">
      <div className="home-intro">
        <p className="eyebrow">RUMAH UNTUK PARA ALUMNI</p>
        <h1>
          Satu sekolah.
          <br />
          Banyak cerita.
          <br />
          <em>Terus terhubung.</em>
        </h1>
        <p className="intro-copy">
          Tempat kembali, saling mengenal, dan mengambil bagian dalam masa depan keluarga alumni
          SMAN Sumatera Selatan.
        </p>
        <div className="school-ribbon">
          <span aria-hidden="true">✦</span> Palembang, Sumatera Selatan
        </div>
      </div>
      <Card className="home-account gap-0">
        <p className="eyebrow">KELUARGA ALUMNI</p>
        <h2>{loaderData.account ? "Selamat datang kembali." : "Cerita kita berlanjut di sini."}</h2>
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
            <p className="quiet-copy">Satu keluarga, sembilan house, ikatan yang terus tumbuh.</p>
          </>
        )}
      </Card>
    </main>
  );
}
