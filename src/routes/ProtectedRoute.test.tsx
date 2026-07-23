import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../contexts/auth-context";
import ProtectedRoute from "./ProtectedRoute";

vi.mock("../contexts/auth-context", () => ({ useAuth: vi.fn() }));

const mockedUseAuth = vi.mocked(useAuth);
const baseContext = {
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  updateUser: vi.fn(),
};

function renderRoutes() {
  render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<p>Private dashboard</p>} />
        </Route>
        <Route path="/login" element={<p>Login page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("protected routing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a loading status while session bootstrap is pending", () => {
    mockedUseAuth.mockReturnValue({ ...baseContext, user: null, loading: true });
    renderRoutes();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("redirects anonymous users to login", () => {
    mockedUseAuth.mockReturnValue({ ...baseContext, user: null, loading: false });
    renderRoutes();
    expect(screen.getByText("Login page")).toBeInTheDocument();
  });

  it("renders protected content for an authenticated user", () => {
    mockedUseAuth.mockReturnValue({
      ...baseContext,
      loading: false,
      user: {
        id: "user-1",
        email: "sales@example.com",
        name: "Sales User",
        role: "MEMBER",
        settings: {
          company: "",
          signature: "",
          aiProvider: "MOCK",
          theme: "DARK",
          notifications: true,
        },
      },
    });
    renderRoutes();
    expect(screen.getByText("Private dashboard")).toBeInTheDocument();
  });
});
