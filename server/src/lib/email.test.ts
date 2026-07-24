import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createTransport, sendMail } = vi.hoisted(() => ({
  createTransport: vi.fn(),
  sendMail: vi.fn(),
}));
const fetchMock = vi.fn();

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
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
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

  it("sends verification, reset, and recovery messages through Resend", async () => {
    vi.stubEnv("EMAIL_DELIVERY_MODE", "resend");
    vi.stubEnv("RESEND_API_KEY", "test-resend-api-key-with-safe-length");
    vi.stubEnv("EMAIL_FROM", "onboarding@resend.dev");
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    const { createEmailService } = await import("./email.js");
    const service = createEmailService();

    await service.sendVerification({
      name: "<Free User>",
      to: "owner@example.com",
      url: "https://sales.example.com/verify-email?token=safe",
    });
    await service.sendPasswordReset({
      name: "Free User",
      to: "owner@example.com",
      url: "https://sales.example.com/reset-password?token=safe",
    });
    await service.sendRecoveryNotice?.({ name: "Free User", to: "owner@example.com" });

    expect(createTransport).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.resend.com/emails");
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(request.headers).toEqual(expect.objectContaining({
      authorization: "Bearer test-resend-api-key-with-safe-length",
    }));
    const payload = JSON.parse(request.body as string) as { html: string; tags: unknown[] };
    expect(payload.html).toContain("&lt;Free User&gt;");
    expect(payload.tags).toEqual([{ name: "category", value: "email_verification" }]);
  });

  it("fails closed when Resend is unavailable", async () => {
    vi.stubEnv("EMAIL_DELIVERY_MODE", "resend");
    vi.stubEnv("RESEND_API_KEY", "test-resend-api-key-with-safe-length");
    fetchMock.mockRejectedValue(new Error("network unavailable"));
    const { createEmailService } = await import("./email.js");

    await expect(createEmailService().sendPasswordReset({
      name: "Free User",
      to: "owner@example.com",
      url: "https://sales.example.com/reset-password?token=safe",
    })).rejects.toThrow("Resend could not be reached");
  });

  it("does not treat a rejected Resend request as delivered", async () => {
    vi.stubEnv("EMAIL_DELIVERY_MODE", "resend");
    vi.stubEnv("RESEND_API_KEY", "test-resend-api-key-with-safe-length");
    fetchMock.mockResolvedValue(new Response("quota exceeded", { status: 429 }));
    const { createEmailService } = await import("./email.js");

    await expect(createEmailService().sendVerification({
      name: "Free User",
      to: "owner@example.com",
      url: "https://sales.example.com/verify-email?token=safe",
    })).rejects.toThrow("Resend rejected the email with HTTP 429");
  });
});
