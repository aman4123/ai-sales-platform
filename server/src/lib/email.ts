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

export interface CampaignEmailInput {
  to: string;
  subject: string;
  greeting: string;
  body: string;
  cta: string;
  closing: string;
  signature: string;
  unsubscribeFooter: string;
}

export interface EmailService {
  sendVerification(input: AccountEmailInput): Promise<void>;
  sendPasswordReset(input: AccountEmailInput): Promise<void>;
  sendRecoveryNotice?(input: AccountNoticeInput): Promise<void>;
  sendCampaign?(input: CampaignEmailInput): Promise<void>;
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

  async sendCampaign(input: CampaignEmailInput) {
    if (!env.OUTBOUND_EMAIL_ENABLED) {
      throw new Error("Outbound campaign email is disabled.");
    }
    if (
      env.OUTBOUND_DELIVERY_MODE === "test" &&
      input.to.trim().toLowerCase() !== env.OUTBOUND_TEST_RECIPIENT
    ) {
      throw new Error("Test delivery refused a recipient outside the allowlist.");
    }
    if (env.OUTBOUND_DELIVERY_MODE === "disabled") {
      throw new Error("Outbound campaign delivery mode is disabled.");
    }
    if (env.TEST_EMAIL_FAILURE_SUBJECT && input.subject.includes(env.TEST_EMAIL_FAILURE_SUBJECT)) {
      throw new Error("The deterministic test email provider is unavailable.");
    }
    const text = [
      input.greeting,
      "",
      input.body,
      "",
      input.cta,
      "",
      input.closing,
      input.signature,
      "",
      input.unsubscribeFooter,
    ]
      .filter((line, index, values) => line || values[index - 1] !== "")
      .join("\n");
    const html = [
      `<p>${escapeHtml(input.greeting)}</p>`,
      `<p>${escapeHtml(input.body).replace(/\n/g, "<br>")}</p>`,
      `<p>${escapeHtml(input.cta)}</p>`,
      `<p>${escapeHtml(input.closing)}<br>${escapeHtml(input.signature).replace(/\n/g, "<br>")}</p>`,
      `<p>${escapeHtml(input.unsubscribeFooter)}</p>`,
    ].join("");
    await this.send({
      kind: "approved_campaign",
      to: input.to,
      subject: input.subject,
      text,
      html,
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
