import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { useAuth } from "../contexts/auth-context";
import AdminRoute from "./AdminRoute";

vi.mock("../contexts/auth-context", () => ({ useAuth: vi.fn() }));

function renderRoute(role: "USER" | "ADMIN" | "SUPER_ADMIN") {
  vi.mocked(useAuth).mockReturnValue({ user: { id: "user-1", email: "user@example.com", emailVerified: true, name: "User", role, accountRole: role, accessMode: role === "SUPER_ADMIN" ? "MASTER_ADMIN" : "USER", availableModes: role === "SUPER_ADMIN" ? ["USER", "TESTER", "MASTER_ADMIN"] : [], settings: { company: "", signature: "", aiProvider: "MOCK", theme: "DARK", notifications: true } }, loading: false, login: vi.fn(), register: vi.fn(), acceptSession: vi.fn(), switchMode: vi.fn(), logout: vi.fn(), updateUser: vi.fn() });
  render(<MemoryRouter initialEntries={["/admin"]}><Routes><Route path="/dashboard" element={<p>Overview</p>} /><Route element={<AdminRoute />}><Route path="/admin" element={<p>Admin area</p>} /></Route></Routes></MemoryRouter>);
}

describe("AdminRoute", () => {
  it("redirects regular users", () => { renderRoute("USER"); expect(screen.getByText("Overview")).toBeInTheDocument(); });
  it.each(["ADMIN", "SUPER_ADMIN"] as const)("allows %s", (role) => { renderRoute(role); expect(screen.getByText("Admin area")).toBeInTheDocument(); });
});
