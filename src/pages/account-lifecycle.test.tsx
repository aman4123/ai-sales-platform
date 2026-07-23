import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../contexts/auth-context";
import { api } from "../services/api";
import ForgotPassword from "./ForgotPassword";
import RecoverAccount from "./RecoverAccount";
import ResetPassword from "./ResetPassword";
import VerifyEmail from "./VerifyEmail";

vi.mock("../contexts/auth-context", () => ({ useAuth: vi.fn() }));
vi.mock("../services/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("../services/api")>();
  return { ...original, api: { post: vi.fn() } };
});

const mockedPost = vi.mocked(api.post);
const acceptSession = vi.fn();

describe("account lifecycle pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      loading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      acceptSession,
      updateUser: vi.fn(),
    });
  });

  it("verifies an email and presents one-time recovery codes", async () => {
    const session = {
      accessToken: "access-token",
      user: {
        id: "user-1",
        email: "sales@example.com",
        emailVerified: true,
        name: "Sales User",
        role: "MEMBER" as const,
        settings: {
          company: "",
          signature: "",
          aiProvider: "MOCK" as const,
          theme: "DARK" as const,
          notifications: true,
        },
      },
      recoveryCodes: ["AAAAA-BBBBB-CCCCC-DDDDD", "EEEEE-FFFFF-GGGGG-HHHHH"],
    };
    mockedPost.mockResolvedValue({ data: { data: session } });
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/verify-email?token=opaque-token-value-that-is-long-enough"]}><VerifyEmail /></MemoryRouter>);

    await user.click(screen.getByRole("button", { name: "Verify email" }));

    expect(mockedPost).toHaveBeenCalledWith("/auth/verify-email", {
      token: "opaque-token-value-that-is-long-enough",
    });
    expect(acceptSession).toHaveBeenCalledWith(session);
    expect(await screen.findAllByRole("listitem")).toHaveLength(2);
  });

  it("requests a password reset without revealing account existence", async () => {
    mockedPost.mockResolvedValue({
      data: { data: { message: "If an eligible account exists, an email will arrive shortly.", developmentResetToken: "reset-token" } },
    });
    const user = userEvent.setup();
    render(<MemoryRouter><ForgotPassword /></MemoryRouter>);

    await user.type(screen.getByLabelText("Email address"), "sales@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByRole("status")).toHaveTextContent("eligible account");
    expect(screen.getByRole("link", { name: "Open development link" })).toHaveAttribute(
      "href",
      "/reset-password?token=reset-token",
    );
  });

  it("confirms a password reset token", async () => {
    mockedPost.mockResolvedValue({ data: undefined });
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/reset-password?token=reset-token"]}><ResetPassword /></MemoryRouter>);

    await user.type(screen.getByLabelText("New password"), "a-new-secure-password");
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(mockedPost).toHaveBeenCalledWith("/auth/password-reset/confirm", {
      token: "reset-token",
      password: "a-new-secure-password",
    });
    expect(await screen.findByRole("heading", { name: "Password changed" })).toBeInTheDocument();
  });

  it("recovers an account with a backup code", async () => {
    mockedPost.mockResolvedValue({ data: undefined });
    const user = userEvent.setup();
    render(<MemoryRouter><RecoverAccount /></MemoryRouter>);

    await user.type(screen.getByLabelText("Email address"), "sales@example.com");
    await user.type(screen.getByLabelText("Recovery code"), "AAAAA-BBBBB-CCCCC-DDDDD");
    await user.type(screen.getByLabelText("New password"), "another-secure-password");
    await user.click(screen.getByRole("button", { name: "Recover account" }));

    expect(mockedPost).toHaveBeenCalledWith("/auth/recover", {
      email: "sales@example.com",
      recoveryCode: "AAAAA-BBBBB-CCCCC-DDDDD",
      password: "another-secure-password",
    });
    expect(await screen.findByRole("heading", { name: "Recover account" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("existing sessions were signed out");
  });
});
