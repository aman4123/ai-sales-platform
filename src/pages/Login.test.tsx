import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../contexts/auth-context";
import Login from "./Login";

vi.mock("../contexts/auth-context", () => ({ useAuth: vi.fn() }));

const login = vi.fn();
const register = vi.fn();
const mockedUseAuth = vi.mocked(useAuth);

function renderPage(mode: "login" | "register") {
  render(
    <MemoryRouter initialEntries={[mode === "login" ? "/login" : "/register"]}>
      <Routes>
        <Route path="/login" element={<Login mode="login" />} />
        <Route path="/register" element={<Login mode="register" />} />
        <Route path="/dashboard" element={<p>Dashboard</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("authentication form", () => {
  beforeEach(() => {
    login.mockReset();
    register.mockReset();
    mockedUseAuth.mockReturnValue({
      user: null,
      loading: false,
      login,
      register,
      logout: vi.fn(),
      acceptSession: vi.fn(),
      updateUser: vi.fn(),
    });
  });

  it("labels and submits the login fields", async () => {
    const user = userEvent.setup();
    renderPage("login");

    await user.type(screen.getByLabelText("Email address"), "sales@example.com");
    await user.type(screen.getByLabelText("Password"), "safe-password");
    await user.click(screen.getByRole("button", { name: "Login" }));

    expect(login).toHaveBeenCalledWith("sales@example.com", "safe-password");
    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
  });

  it("labels and submits registration fields", async () => {
    register.mockResolvedValue({
      email: "admin@example.com",
      verificationRequired: true,
      developmentVerificationToken: "verification-token",
    });
    const user = userEvent.setup();
    renderPage("register");

    expect(screen.getByLabelText("Password")).toHaveAttribute("minlength", "12");

    await user.type(screen.getByLabelText("Full name"), "Sales Admin");
    await user.type(screen.getByLabelText("Email address"), "admin@example.com");
    await user.type(screen.getByLabelText("Password"), "safe-password");
    await user.click(screen.getByRole("button", { name: "Register" }));

    expect(register).toHaveBeenCalledWith("Sales Admin", "admin@example.com", "safe-password");
    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open development verification link" })).toHaveAttribute(
      "href",
      "/verify-email?token=verification-token",
    );
  });
});
