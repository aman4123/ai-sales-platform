import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createTransport, sendMail } = vi.hoisted(() => ({
  createTransport: vi.fn(),
  sendMail: vi.fn(),
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport,
  },
}));

describe("transactional email adapter", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    createTransport.mockReturnValue({ sendMail });
    sendMail.mockResolvedValue({ messageId: "message-1" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("sends escaped verification and password-reset messages over SMTP", async () => {
    vi.stubEnv("EMAIL_DELIVERY_MODE", "smtp");
    vi.stubEnv("SMTP_HOST", "smtp.example.com");
    vi.stubEnv("SMTP_USER", "smtp-user");
    vi.stubEnv("SMTP_PASSWORD", "smtp-password");
    vi.stubEnv("EMAIL_FROM", "no-reply@example.com");
    const { createEmailService } = await import("./email.js");
    const service = createEmailService();

    await service.sendVerification({
      name: "<Sales & Admin>",
      to: "sales@example.com",
      url: "https://sales.example.com/verify-email?token=safe",
    });
    await service.sendPasswordReset({
      name: "Sales User",
      to: "sales@example.com",
      url: "https://sales.example.com/reset-password?token=safe",
    });

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: "smtp.example.com", auth: { user: "smtp-user", pass: "smtp-password" } }),
    );
    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(sendMail.mock.calls[0]?.[0].html).toContain("&lt;Sales &amp; Admin&gt;");
    expect(sendMail.mock.calls[0]?.[0].html).not.toContain("<Sales & Admin>");
  });

  it("accepts development messages without exposing their token in logs", async () => {
    vi.stubEnv("EMAIL_DELIVERY_MODE", "log");
    const { createEmailService } = await import("./email.js");
    const service = createEmailService();

    await service.sendVerification({
      name: "Development User",
      to: "developer@example.com",
      url: "http://localhost:5173/verify-email?token=secret",
    });

    expect(createTransport).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });
});
