import { env } from "cloudflare:workers";
import { Form, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/login";
import { authFormRequest, getAccount, handleAuth, hasTrustedOrigin } from "../auth/auth.server";

export async function loader({ request }: Route.LoaderArgs) {
  if (await getAccount(request, env)) throw redirect("/");
  return null;
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
  if (intent === "verify") return redirect("/", { headers: response.headers });
  return { email, sent: true, error: null };
}

export default function Login({ actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  return (
    <main className="mx-auto max-w-md p-8 space-y-6">
      <h1 className="text-2xl font-semibold">Masuk ke komunitas alumni</h1>
      <p>Gunakan email Anda. Kami akan mengirim kode untuk masuk.</p>
      {actionData?.error && <p role="alert">{actionData.error}</p>}
      {actionData?.sent && (
        <p role="status">Kode telah dikirim. Periksa email Anda. Kode berlaku selama 5 menit.</p>
      )}
      <Form method="post" className="space-y-4">
        <label className="block">
          Email
          <input
            className="block border rounded p-2 w-full"
            type="email"
            name="email"
            autoComplete="email"
            defaultValue={actionData?.email}
            required
          />
        </label>
        <button disabled={busy} name="intent" value="send" className="border rounded px-4 py-2">
          {actionData?.sent ? "Kirim ulang kode" : "Kirim kode"}
        </button>
      </Form>
      {actionData?.sent && (
        <Form method="post" className="space-y-4">
          <input type="hidden" name="email" value={actionData.email} />
          <label className="block">
            Kode masuk
            <input
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
          <button disabled={busy} name="intent" value="verify" className="border rounded px-4 py-2">
            Masuk
          </button>
        </Form>
      )}
    </main>
  );
}
