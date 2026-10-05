import { env } from "cloudflare:workers";
import { Form, Link, data } from "react-router";
import type { Route } from "./+types/invitation";
import { getAccount } from "../auth/auth.server";
import { readInvitation, acceptInvitation } from "../authorization/invitations.server";
import { roleLabels } from "../authorization/roles";
import { pageTitle } from "../content/page-title";
import { Button } from "../components/ui/button";
export function meta() {
  return [{ title: pageTitle("Undangan perwakilan sekolah") }];
}
export async function loader({ request, params }: Route.LoaderArgs) {
  if (!(await getAccount(request, env))) return { invitation: null, id: params.invitationId };
  return {
    invitation: await readInvitation(request, env, params.invitationId),
    id: params.invitationId,
  };
}
export async function action({ request, params }: Route.ActionArgs) {
  try {
    await acceptInvitation(
      request,
      env,
      params.invitationId,
      Object.fromEntries(await request.formData())
    );
    return { error: null };
  } catch (error) {
    if (!(error instanceof Response) || ![400, 409].includes(error.status)) throw error;
    return data({ error: await error.text() }, { status: error.status });
  }
}
export default function Invitation({ loaderData, actionData }: Route.ComponentProps) {
  const invitation = loaderData.invitation;
  return (
    <main className="mx-auto max-w-xl p-8 space-y-6">
      <h1>Undangan perwakilan sekolah</h1>
      <p>
        Gunakan email penerima undangan. Pengajuan keanggotaan dan profil alumni tidak diperlukan.
      </p>
      {!invitation ? (
        <Link to={`/login?next=/invitations/${loaderData.id}`}>Masuk dengan kode email</Link>
      ) : (
        <>
          <p>Peran: {roleLabels[invitation.role]}</p>
          <p>Berlaku hingga {invitation.expiresAt} (UTC).</p>
          {actionData?.error && <p role="alert">{actionData.error}</p>}
          {invitation.accepted ? (
            <p role="status">Undangan telah diterima. Peran sekolah telah diberikan.</p>
          ) : invitation.expired ? (
            <p>Undangan sudah kedaluwarsa. Hubungi administrator utama untuk undangan baru.</p>
          ) : (
            <Form method="post">
              <Button>Terima undangan</Button>
            </Form>
          )}
          <Link to="/">Beranda</Link>
        </>
      )}
    </main>
  );
}
