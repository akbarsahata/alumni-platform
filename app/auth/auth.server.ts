import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/d1";
import { authSchema } from "./schema";
import { sendEmail } from "../email/email.server";

export function createAuth(env: Env) {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(drizzle(env.DB, { schema: authSchema }), {
      provider: "sqlite",
      schema: authSchema,
      transaction: false,
    }),
    rateLimit: { enabled: true, storage: "database" },
    advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
    plugins: [
      emailOTP({
        storeOTP: "hashed",
        async sendVerificationOTP({ email, otp }) {
          await sendEmail(env, {
            to: email,
            subject: "Kode masuk keluarga alumni",
            text: `Kode masuk Anda: ${otp}. Kode berlaku selama 5 menit. Jangan bagikan kode ini.`,
          });
        },
      }),
    ],
  });
}

const endpoints = new Map([
  ["/api/auth/email-otp/send-verification-otp", "POST"],
  ["/api/auth/sign-in/email-otp", "POST"],
  ["/api/auth/sign-out", "POST"],
  ["/api/auth/get-session", "GET"],
]);

export function hasTrustedOrigin(request: Request, env: Env) {
  return request.headers.get("Origin") === new URL(env.BETTER_AUTH_URL).origin;
}

// Restrict the product surface: no password login, OTP retrieval, or identity edits.
export async function handleAuth(request: Request, env: Env) {
  const path = new URL(request.url).pathname;
  const method = endpoints.get(path);
  if (!method) return new Response(null, { status: 404 });
  if (method !== request.method) return new Response(null, { status: 405 });
  if (method === "POST" && !hasTrustedOrigin(request, env)) {
    return Response.json({ message: "Permintaan tidak diizinkan." }, { status: 403 });
  }
  if (path.endsWith("/send-verification-otp")) {
    const body = await request
      .clone()
      .json()
      .catch(() => null);
    if (!body || typeof body !== "object" || !("type" in body) || body.type !== "sign-in")
      return Response.json({ message: "Permintaan tidak valid." }, { status: 400 });
  }
  const response = await createAuth(env).handler(request);
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  // Session tokens belong in HttpOnly cookies, never JSON or loader data.
  if (response.ok && (path.endsWith("/email-otp") || path.endsWith("/get-session"))) {
    const result = (await response.json()) as {
      user: { id: string; email: string; emailVerified: boolean };
    } | null;
    return Response.json(
      result
        ? {
            user: {
              id: result.user.id,
              email: result.user.email,
              emailVerified: result.user.emailVerified,
            },
          }
        : null,
      { status: response.status, headers }
    );
  }
  return new Response(response.body, { status: response.status, headers });
}

export async function getAccount(request: Request, env: Env) {
  const result = await createAuth(env).api.getSession({
    headers: request.headers,
  });
  return result
    ? {
        id: result.user.id,
        email: result.user.email,
        emailVerified: result.user.emailVerified,
      }
    : null;
}

export function authFormRequest(request: Request, path: string, body: object) {
  const headers = new Headers(request.headers);
  headers.set("Content-Type", "application/json");
  headers.delete("Content-Length");
  return new Request(new URL(path, request.url), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}
