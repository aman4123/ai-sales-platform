import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, refreshSession, setAccessToken } from "../services/api";
import type { AuthPayload } from "../types/api";
import { useAuth } from "./auth-context";
import { AuthProvider } from "./AuthContext";

vi.mock("../services/api", () => ({
  api: { post: vi.fn() },
  refreshSession: vi.fn(),
  setAccessToken: vi.fn(),
}));

const session: AuthPayload = {
  accessToken: "access-token",
  user: {
    id: "user-1",
    email: "sales@example.com",
    emailVerified: true,
    name: "Sales User",
    role: "MEMBER",
    settings: {
      company: "Example",
      signature: "",
      aiProvider: "MOCK",
      theme: "DARK",
      notifications: true,
    },
  },
};
const mockedRefresh = vi.mocked(refreshSession);
const mockedPost = vi.mocked(api.post);
const mockedSetToken = vi.mocked(setAccessToken);

function Consumer() {
  const { user, loading, login, logout } = useAuth();
  return (
    <div>
      <p>{loading ? "Loading session" : user?.email ?? "Signed out"}</p>
      <button type="button" onClick={() => void login("sales@example.com", "password")}>Login now</button>
      <button type="button" onClick={() => void logout()}>Logout now</button>
    </div>
  );
}

describe("authentication context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("restores an existing refresh session", async () => {
    mockedRefresh.mockResolvedValue(session);
    render(<AuthProvider><Consumer /></AuthProvider>);
    expect(await screen.findByText("sales@example.com")).toBeInTheDocument();
  });

  it("logs in and logs out without persisting the access token", async () => {
    mockedRefresh.mockRejectedValue(new Error("No session"));
    mockedPost
      .mockResolvedValueOnce({ data: { data: session } })
      .mockResolvedValueOnce({ data: undefined });
    const user = userEvent.setup();
    render(<AuthProvider><Consumer /></AuthProvider>);
    expect(await screen.findByText("Signed out")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Login now" }));
    expect(await screen.findByText("sales@example.com")).toBeInTheDocument();
    expect(mockedSetToken).toHaveBeenCalledWith("access-token");

    await user.click(screen.getByRole("button", { name: "Logout now" }));
    expect(await screen.findByText("Signed out")).toBeInTheDocument();
    expect(mockedSetToken).toHaveBeenLastCalledWith(null);
  });
});
