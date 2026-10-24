import { localMailRepository } from "../db/local-mail.repository.server";
import { EmailDeliveryError, sendWithResend } from "./resend.server";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export type EmailTransport = "local" | "resend";

export interface EmailDeliveryResult {
  delivered: boolean;
  transport: EmailTransport;
  messageId?: string;
}

export interface SendEmailOptions {
  idempotencyKey?: string;
  localCapture?: () => Promise<boolean>;
  useProvider?: boolean;
}

export async function sendEmail(
  env: Env,
  message: EmailMessage,
  options: SendEmailOptions = {}
): Promise<EmailDeliveryResult> {
  const environment: string = env.ENVIRONMENT;
  if (environment === "development" || environment === "test") {
    if (!import.meta.env.DEV || !env.LOCAL_MAIL || !env.LOCAL_MAIL_KEY)
      throw new EmailDeliveryError();
    if (environment === "test" && options.useProvider) {
      const result = await sendWithResend(
        {
          apiKey: env.RESEND_API_KEY,
          from: env.EMAIL_FROM,
          replyTo: env.EMAIL_REPLY_TO,
        },
        message,
        options.idempotencyKey,
        { endpoint: env.RESEND_API_URL }
      );
      return { delivered: true, transport: "resend", messageId: result.messageId };
    }
    if (options.localCapture)
      return { delivered: await options.localCapture(), transport: "local" };
    await env.LOCAL_MAIL.put(message.to.toLowerCase(), JSON.stringify(message), {
      expirationTtl: 600,
      metadata: { capturedAt: Date.now() },
    });
    return { delivered: true, transport: "local" };
  }

  if (environment !== "staging" && environment !== "production") throw new EmailDeliveryError();

  const result = await sendWithResend(
    {
      apiKey: env.RESEND_API_KEY,
      from: env.EMAIL_FROM,
      replyTo: env.EMAIL_REPLY_TO,
    },
    message,
    options.idempotencyKey
  );
  return { delivered: true, transport: "resend", messageId: result.messageId };
}

export async function readLocalMail(request: Request, env: Env) {
  const url = new URL(request.url);
  if (
    !["development", "test"].includes(env.ENVIRONMENT) ||
    !import.meta.env.DEV ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
  ) {
    return new Response(null, { status: 404 });
  }
  if (
    !env.LOCAL_MAIL_KEY ||
    request.headers.get("Authorization") !== `Bearer ${env.LOCAL_MAIL_KEY}`
  ) {
    return new Response(null, { status: 404 });
  }
  if (request.method !== "GET") return new Response(null, { status: 405 });
  const recipient = url.searchParams.get("email")?.toLowerCase() || "";
  const [mail, introduction] = await Promise.all([
    env.LOCAL_MAIL.getWithMetadata<EmailMessage, { capturedAt: number }>(recipient, "json"),
    localMailRepository(env.DB).introduction(recipient),
  ]);
  const message =
    introduction && introduction.capturedAt >= (mail.metadata?.capturedAt ?? 0)
      ? (JSON.parse(introduction.message) as EmailMessage)
      : mail.value;
  return Response.json(message, { headers: { "Cache-Control": "no-store" } });
}
