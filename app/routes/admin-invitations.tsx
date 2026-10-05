import { env } from "cloudflare:workers";
import { Form, Link, data, useNavigation } from "react-router";
import type { Route } from "./+types/admin-invitations";
import { requirePrimary } from "../authorization/permissions.server";
import { issueInvitation } from "../authorization/invitations.server";
import { pageTitle } from "../content/page-title";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Button } from "../components/ui/button";
export function meta() {
  return [{ title: pageTitle("Undang perwakilan sekolah") }];
}
export async function loader({ request }: Route.LoaderArgs) {
  await requirePrimary(request, env);
  return null;
}
export async function action({ request }: Route.ActionArgs) {
  await requirePrimary(request, env);
  try {
    return {
      invitation: await issueInvitation(request, env, Object.fromEntries(await request.formData())),
      error: null,
    };
  } catch (error) {
    if (!(error instanceof Response) || error.status !== 400) throw error;
    return data({ invitation: null, error: await error.text() }, { status: 400 });
  }
}
export default function Invitations({ actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== "idle";
  return (
    <main className="mx-auto max-w-xl p-8 space-y-6">
      <h1>Undang perwakilan sekolah</h1>
      <Link to="/admin/roles">Kelola peran</Link>
      <p>
        Undangan berlaku tujuh hari, hanya untuk satu email dan satu peran. Penerima memverifikasi
        email dengan kode masuk; pengajuan atau profil alumni tidak diperlukan.
      </p>
      {actionData?.error && <p role="alert">{actionData.error}</p>}
      {actionData?.invitation && (
        <p role="status">
          {actionData.invitation.delivered
            ? "Undangan telah dikirim."
            : "Undangan tersimpan, tetapi email belum terkirim. Sampaikan tautan undangan atau terbitkan undangan baru."}{" "}
          Berlaku hingga {actionData.invitation.expiresAt}.{" "}
          <Link to={`/invitations/${actionData.invitation.id}`}>Tautan undangan</Link>
        </p>
      )}
      <Form method="post" className="space-y-4">
        <label className="block">
          Email penerima
          <Input name="email" type="email" required maxLength={254} />
        </label>
        <label className="block">
          Peran sekolah
          <select name="role">
            <option value="staff">Staf sekolah</option>
            <option value="student">Perwakilan siswa</option>
          </select>
        </label>
        <label className="block">
          Alasan undangan
          <Textarea name="reason" required maxLength={1000} />
        </label>
        <Button disabled={busy}>Kirim undangan</Button>
      </Form>
    </main>
  );
}
