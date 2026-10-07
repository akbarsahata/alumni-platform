import { pageTitle } from "../content/page-title";
import { LoginPage } from "../components/login-page";
import { env } from "cloudflare:workers";
import { data, redirect } from "react-router";
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
  return <LoginPage loaderData={loaderData} actionData={actionData} />;
}
