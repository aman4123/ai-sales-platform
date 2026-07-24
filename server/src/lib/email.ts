import { createHash } from "node:crypto";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

interface AccountEmailInput {
  name: string;
  to: string;
  url: string;
}

interface AccountNoticeInput {
  name: string;
  to: string;
}

export interface EmailService {
  sendVerification(input: AccountEmailInput): Promise<void>;
  sendPasswordReset(input: AccountEmailInput): Promise<void>;
  sendRecoveryNotice?(input: AccountNoticeInput): Promise<void>;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]!);
}

function recipientHash(value: string) {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex").slice(0, 16);
}

function messageBody(name: string, action: string, url: string, lifetime: string) {
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(url);
  return {
    text: `Hello ${name},\n\n${action}: ${url}\n\nThis link expires in ${lifetime}. If you did not request this, you can ignore this email.`,
    html: `<p>Hello ${safeName},</p><p>${action}:</p><p><a href="${safeUrl}">${safeUrl}</a></p><p>This link expires in ${lifetime}. If you did not request this, you can ignore this email.</p>`,
  };
}

class AccountEmailService implements EmailService {
  private readonly transporter: Transporter | null;

  constructor() {
    this.transporter = env.EMAIL_DELIVERY_MODE === "smtp"
      ? nodemailer.createTransport({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: env.SMTP_SECURE,
          ...(env.SMTP_USER && env.SMTP_PASSWORD
            ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } }
            : {}),
          connectionTimeout: 10_000,
          greetingTimeout: 10_000,
          socketTimeout: 20_000,
        })
      : null;
  }

  async sendVerification({ name, to, url }: AccountEmailInput) {
    const body = messageBody(
      name,
      "Verify your email address",
      url,
      `${env.EMAIL_VERIFICATION_TTL_MINUTES} minutes`,
    );
    await this.send({
      kind: "email_verification",
      to,
      subject: "Verify your AI Sales Platform email",
      ...body,
    });
  }

  async sendPasswordReset({ name, to, url }: AccountEmailInput) {
    const body = messageBody(
      name,
      "Reset your password",
      url,
      `${env.PASSWORD_RESET_TTL_MINUTES} minutes`,
    );
    await this.send({
      kind: "password_reset",
      to,
      subject: "Reset your AI Sales Platform password",
      ...body,
    });
  }

  async sendRecoveryNotice({ name, to }: AccountNoticeInput) {
    const safeName = escapeHtml(name);
    await this.send({
      kind: "account_recovered",
      to,
      subject: "Your AI Sales Platform account was recovered",
      text: `Hello ${name},\n\nYour password was changed using a recovery code and all active sessions were revoked. If you did not perform this recovery, contact support immediately.`,
      html: `<p>Hello ${safeName},</p><p>Your password was changed using a recovery code and all active sessions were revoked.</p><p>If you did not perform this recovery, contact support immediately.</p>`,
    });
  }

  private async send(input: {
    kind: string;
    to: string;
    subject: string;
    text: string;
    html: string;
  }) {
    if (env.EMAIL_DELIVERY_MODE === "log") {
      logger.info(
        { emailKind: input.kind, recipientHash: recipientHash(input.to) },
        "Development email accepted",
      );
      return;
    }

    if (env.EMAIL_DELIVERY_MODE === "resend") {
      let response: Response;
      try {
        response = await fetch(`${env.RESEND_API_URL.replace(/\/$/, "")}/emails`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${env.RESEND_API_KEY}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            from: `AI Sales Platform <${env.EMAIL_FROM}>`,
            to: [input.to],
            subject: input.subject,
            text: input.text,
            html: input.html,
            tags: [{ name: "category", value: input.kind }],
          }),
          signal: AbortSignal.timeout(env.EMAIL_REQUEST_TIMEOUT_MS),
        });
      } catch (error) {
        throw new Error("Resend could not be reached.", { cause: error });
      }
      await response.body?.cancel();
      if (!response.ok) {
        throw new Error(`Resend rejected the email with HTTP ${response.status}.`);
      }
    } else {
      await this.transporter!.sendMail({
        from: { name: "AI Sales Platform", address: env.EMAIL_FROM },
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      });
    }
    logger.info(
      {
        emailKind: input.kind,
        recipientHash: recipientHash(input.to),
        provider: env.EMAIL_DELIVERY_MODE,
      },
      "Transactional email delivered",
    );
  }
}

export function createEmailService(): EmailService {
  return new AccountEmailService();
}
