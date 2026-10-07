import { pageTitle } from "../content/page-title";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { env } from "cloudflare:workers";
import { Form, Link, data, useNavigation } from "react-router";
import type { Route } from "./+types/admin-email-changes";
import { requireReviewer } from "../authorization/permissions.server";
import { emailChangeAccounts, startEmailChange } from "../authorization/email-changes.server";

export function meta() {
  return [{ title: pageTitle("Bantu perubahan email") }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireReviewer(request, env);
  return { accounts: await emailChangeAccounts(request, env) };
}

export async function action({ request }: Route.ActionArgs) {
  await requireReviewer(request, env);
  const form = await request.formData();
  try {
    const result = await startEmailChange(request, env, Object.fromEntries(form));
    return {
      requestId: result.id,
      email: form.get("newEmail"),
      expiresAt: result.expiresAt,
      delivered: result.delivered,
      error: null,
    };
  } catch (error) {
    if (!(error instanceof Response) || ![400, 409].includes(error.status)) throw error;
    return data(
      {
        requestId: null,
        email: null,
        expiresAt: null,
        delivered: false,
        error: await error.text(),
      },
      { status: error.status }
    );
  }
}

export default function AdminEmailChanges({ loaderData, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== "idle";
  return (
    <main className="mx-auto max-w-3xl p-8 space-y-6">
      <h1 className="text-2xl font-semibold">Bantu perubahan email akun</h1>
      <Link className="underline" to="/admin/membership">
        Kembali ke tinjauan keanggotaan
      </Link>
      <p>
        Gunakan hanya setelah memeriksa identitas pemilik akun. Pemilik harus masuk dengan email
        saat ini dan memasukkan kode yang dikirim ke email baru sebelum identitas login berubah.
      </p>
      {actionData?.error && <p role="alert">{actionData.error}</p>}
      {actionData?.requestId && (
        <p role="status">
          {actionData.delivered
            ? `Kode verifikasi dikirim ke ${actionData.email}.`
            : "Permintaan tercatat, tetapi kode belum dapat dikirim."}{" "}
          Tautan untuk pemilik akun:{" "}
          <Link className="underline" to={`/email-changes/${actionData.requestId}`}>
            verifikasi perubahan email
          </Link>
          . Berlaku hingga {actionData.expiresAt} UTC.
        </p>
      )}
      <Form method="post" className="space-y-4">
        <label className="block">
          Akun pemilik
          <select
            name="targetUserId"
            required
            defaultValue=""
            className="block border rounded p-2 w-full"
          >
            <option value="" disabled>
              Pilih akun
            </option>
            {loaderData.accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.email}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          Email baru
          <Input name="newEmail" type="email" maxLength={254} required />
        </label>
        <label className="block">
          Catatan pemeriksaan identitas
          <Textarea name="identityCheck" maxLength={1000} required />
        </label>
        <label className="block">
          Alasan perubahan (privat)
          <Textarea name="reason" maxLength={1000} required />
        </label>
        <Button type="submit" disabled={busy}>
          Kirim kode verifikasi
        </Button>
      </Form>
    </main>
  );
}
