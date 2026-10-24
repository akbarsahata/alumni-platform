export interface ResendConfig {
  apiKey: string;
  from: string;
  replyTo: string;
}

export interface ResendMessage {
  to: string;
  subject: string;
  text: string;
}

export interface ResendOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class EmailDeliveryError extends Error {
  constructor() {
    super("Email delivery failed");
    this.name = "EmailDeliveryError";
  }
}

const resendEndpoint = "https://api.resend.com/emails";

export async function sendWithResend(
  config: ResendConfig,
  message: ResendMessage,
  idempotencyKey?: string,
  options: ResendOptions = {}
): Promise<void> {
  const apiKey = config.apiKey?.trim();
  const from = config.from?.trim();
  const replyTo = config.replyTo?.trim();
  const to = message.to?.trim();
  const subject = message.subject?.trim();
  const text = message.text;
  if (!apiKey || !from || !replyTo || !to || !subject || !text) throw new EmailDeliveryError();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (idempotencyKey?.trim()) headers["Idempotency-Key"] = idempotencyKey;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
  try {
    const response = await (options.fetchImpl ?? fetch)(resendEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        from,
        to,
        subject,
        text,
        reply_to: replyTo,
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new EmailDeliveryError();
  } catch (error) {
    if (error instanceof EmailDeliveryError) throw error;
    throw new EmailDeliveryError();
  } finally {
    clearTimeout(timer);
  }
}
