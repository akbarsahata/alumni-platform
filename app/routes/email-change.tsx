import { pageTitle } from "../content/page-title";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { env } from "cloudflare:workers";
import { Form, Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/email-change";
import { readEmailChange, verifyEmailChange } from "../authorization/email-changes.server";

export function meta() {
  return [{ title: pageTitle("Verifikasi perubahan email") }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  return readEmailChange(request, env, params.requestId);
}

export async function action({ request, params }: Route.ActionArgs) {
  const form = await request.formData();
  try {
    await verifyEmailChange(request, env, params.requestId, Object.fromEntries(form));
    throw redirect("/login?emailChanged=1");
  } catch (error) {
    if (!(error instanceof Response) || ![400, 409].includes(error.status)) throw error;
    return data({ error: await error.text() }, { status: error.status });
  }
}

export default function EmailChange({ loaderData, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== "idle";
  return (
    <main className="mx-auto max-w-md p-8 space-y-6">
      <h1 className="text-2xl font-semibold">Verifikasi perubahan email</h1>
      <p>
        Email baru: <strong>{loaderData.email}</strong>
      </p>
      <p>
        Pemilik akun harus masuk menggunakan email lama saat memasukkan kode. Kode berlaku hingga{" "}
        <time dateTime={loaderData.expiresAt}>{loaderData.expiresAt} UTC</time>.
      </p>
      {actionData?.error && <p role="alert">{actionData.error}</p>}
      {loaderData.expired ? (
        <p>Kode sudah kedaluwarsa. Hubungi administrator untuk meminta verifikasi baru.</p>
      ) : (
        <Form method="post" className="space-y-4">
          <label className="block">
            Kode verifikasi email baru
            <Input
              name="token"
              autoComplete="one-time-code"
              minLength={64}
              maxLength={64}
              pattern="[a-f0-9]{64}"
              required
            />
          </label>
          <Button type="submit" disabled={busy}>
            Verifikasi dan ubah email
          </Button>
        </Form>
      )}
      <Link className="underline" to="/login">
        Masuk dengan email akun saat ini
      </Link>
    </main>
  );
}
