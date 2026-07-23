import { createHash } from "node:crypto";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

interface AccountEmailInput {
  name: string;
  to: string;
  url: string;
}

export interface EmailService {
  sendVerification(input: AccountEmailInput): Promise<void>;
  sendPasswordReset(input: AccountEmailInput): Promise<void>;
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
    await this.send({
      kind: "email_verification",
      name,
      to,
      url,
      subject: "Verify your AI Sales Platform email",
      action: "Verify your email address",
      lifetime: `${env.EMAIL_VERIFICATION_TTL_MINUTES} minutes`,
    });
  }

  async sendPasswordReset({ name, to, url }: AccountEmailInput) {
    await this.send({
      kind: "password_reset",
      name,
      to,
      url,
      subject: "Reset your AI Sales Platform password",
      action: "Reset your password",
      lifetime: `${env.PASSWORD_RESET_TTL_MINUTES} minutes`,
    });
  }

  private async send(input: AccountEmailInput & {
    kind: string;
    subject: string;
    action: string;
    lifetime: string;
  }) {
    if (!this.transporter) {
      logger.info(
        { emailKind: input.kind, recipientHash: recipientHash(input.to) },
        "Development email accepted",
      );
      return;
    }

    const body = messageBody(input.name, input.action, input.url, input.lifetime);
    await this.transporter.sendMail({
      from: { name: "AI Sales Platform", address: env.EMAIL_FROM },
      to: input.to,
      subject: input.subject,
      ...body,
    });
    logger.info(
      { emailKind: input.kind, recipientHash: recipientHash(input.to) },
      "Transactional email delivered",
    );
  }
}

export function createEmailService(): EmailService {
  return new AccountEmailService();
}
