import { pageTitle } from "../content/page-title";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { env } from "cloudflare:workers";
import { Form, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/login";
import { authFormRequest, getAccount, handleAuth, hasTrustedOrigin } from "../auth/auth.server";

export function meta() {
  return [{ title: pageTitle("Masuk") }];
}

function invitationReturn(request: Request) {
  const next = new URL(request.url).searchParams.get("next");
  return next && /^\/invitations\/[a-f0-9]{32}$/.test(next) ? next : "/";
}

export async function loader({ request }: Route.LoaderArgs) {
  if (await getAccount(request, env)) throw redirect(invitationReturn(request));
  return { emailChanged: new URL(request.url).searchParams.get("emailChanged") === "1" };
}

export async function action({ request }: Route.ActionArgs) {
  if (!hasTrustedOrigin(request, env))
    throw new Response("Permintaan tidak diizinkan.", { status: 403 });
  const form = await request.formData();
  const email = String(form.get("email") || "").trim();
  const intent = form.get("intent");
  if (intent !== "send" && intent !== "verify")
    return data({ email, sent: false, error: "Permintaan tidak valid." }, { status: 400 });
  const response = await handleAuth(
    authFormRequest(
      request,
      intent === "send"
        ? "/api/auth/email-otp/send-verification-otp"
        : "/api/auth/sign-in/email-otp",
      intent === "send" ? { email, type: "sign-in" } : { email, otp: String(form.get("otp") || "") }
    ),
    env
  );
  if (!response.ok) {
    const error =
      response.status === 429
        ? "Terlalu banyak percobaan. Tunggu sebentar sebelum mencoba lagi."
        : intent === "send"
          ? "Kode belum terkirim. Periksa email Anda dan coba lagi."
          : "Kode tidak valid atau sudah kedaluwarsa. Minta kode baru.";
    return data({ email, sent: intent === "verify", error }, { status: response.status });
  }
  if (intent === "verify")
    return redirect(invitationReturn(request), { headers: response.headers });
  return { email, sent: true, error: null };
}

export default function Login({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  return (
    <main className="login-page mx-auto max-w-md p-8 space-y-6">
      <p className="eyebrow">SELAMAT DATANG KEMBALI</p>
      <h1 className="text-2xl font-semibold">Masuk ke keluarga alumni</h1>
      {loaderData.emailChanged && (
        <p role="status">Email login berubah. Masuk kembali menggunakan email baru.</p>
      )}
      <p>Gunakan email Anda. Kami akan mengirim kode untuk masuk.</p>
      {actionData?.error && <p role="alert">{actionData.error}</p>}
      {actionData?.sent && (
        <p role="status">Kode telah dikirim. Periksa email Anda. Kode berlaku selama 5 menit.</p>
      )}
      <Form method="post" className="space-y-4">
        <label className="block">
          Email
          <Input
            className="block border rounded p-2 w-full"
            type="email"
            name="email"
            autoComplete="email"
            defaultValue={actionData?.email}
            required
          />
        </label>
        <Button
          type="submit"
          disabled={busy}
          name="intent"
          value="send"
          className="border rounded px-4 py-2"
        >
          {actionData?.sent ? "Kirim ulang kode" : "Kirim kode"}
        </Button>
      </Form>
      {actionData?.sent && (
        <Form method="post" className="space-y-4">
          <Input type="hidden" name="email" value={actionData.email} />
          <label className="block">
            Kode masuk
            <Input
              className="block border rounded p-2 w-full"
              type="text"
              name="otp"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              required
            />
          </label>
          <Button
            type="submit"
            disabled={busy}
            name="intent"
            value="verify"
            className="border rounded px-4 py-2"
          >
            Masuk
          </Button>
        </Form>
      )}
      <p className="quiet-copy login-note">
        Email menghubungkan Anda dengan keluarga alumni. Keanggotaan alumni ditinjau secara
        terpisah.
      </p>
    </main>
  );
}
