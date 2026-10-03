export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

// This slice supports capture only. A built Worker must never deliver or capture mail.
export async function sendEmail(env: Env, message: EmailMessage) {
  if (!import.meta.env.DEV || !env.LOCAL_MAIL_KEY) {
    throw new Error("Email delivery is not configured");
  }
  await env.LOCAL_MAIL.put(message.to.toLowerCase(), JSON.stringify(message), {
    expirationTtl: 600,
  });
}

export async function readLocalMail(request: Request, env: Env) {
  const url = new URL(request.url);
  if (!import.meta.env.DEV || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    return new Response(null, { status: 404 });
  }
  if (
    !env.LOCAL_MAIL_KEY ||
    request.headers.get("Authorization") !== `Bearer ${env.LOCAL_MAIL_KEY}`
  ) {
    return new Response(null, { status: 404 });
  }
  if (request.method !== "GET") return new Response(null, { status: 405 });
  const message = await env.LOCAL_MAIL.get(
    url.searchParams.get("email")?.toLowerCase() || "",
    "json"
  );
  return Response.json(message, { headers: { "Cache-Control": "no-store" } });
}
