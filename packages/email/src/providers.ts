import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "@repo/shared";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Used for provider-side idempotency where supported. */
  idempotencyKey?: string;
  tags?: Record<string, string>;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<{ id: string | null }>;
}

/** Development provider: prints the email (including links) to the server log. */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = "console";
  send(message: EmailMessage): Promise<{ id: string | null }> {
    const divider = "─".repeat(72);
    // Intentionally uses console directly: this *is* the delivery mechanism in development.
    console.log(
      `\n${divider}\n📧 Email (console provider)\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n${divider}\n`,
    );
    return Promise.resolve({ id: null });
  }
}

export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<{ id: string | null }> {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
        ...(message.idempotencyKey ? { "idempotency-key": message.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        tags: message.tags
          ? Object.entries(message.tags).map(([name, value]) => ({ name, value }))
          : undefined,
      }),
    });
    if (!response.ok) {
      logger.error("email.resend_failed", { status: response.status });
      throw new Error(`Email provider returned HTTP ${response.status}`);
    }
    const body = (await response.json()) as { id?: string };
    return { id: body.id ?? null };
  }
}

export class SmtpEmailProvider implements EmailProvider {
  readonly name = "smtp";
  private readonly transport: Transporter;
  constructor(
    smtpUrl: string,
    private readonly from: string,
  ) {
    this.transport = nodemailer.createTransport(smtpUrl);
  }

  async send(message: EmailMessage): Promise<{ id: string | null }> {
    const info = await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    return { id: info.messageId ?? null };
  }
}
