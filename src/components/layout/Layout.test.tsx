import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../../contexts/auth-context";
import Layout from "./Layout";

vi.mock("../../contexts/auth-context", () => ({ useAuth: vi.fn() }));

const logout = vi.fn();
const mockedUseAuth = vi.mocked(useAuth);

function Location() {
  const location = useLocation();
  return <output aria-label="Current location">{location.pathname}{location.search}</output>;
}

describe("application layout", () => {
  beforeEach(() => {
    logout.mockReset();
    mockedUseAuth.mockReturnValue({
      user: {
        id: "user-1",
        email: "sales@example.com",
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
      loading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout,
      updateUser: vi.fn(),
    });
  });

  it("supports responsive navigation, current-page state, and global CRM search", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Layout>
          <p>Page content</p>
          <Location />
        </Layout>
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(screen.getAllByRole("button", { name: "Close navigation" })).not.toHaveLength(0);

    const search = screen.getByRole("searchbox", { name: "Search CRM" });
    await user.type(search, "Acme{enter}");
    expect(screen.getByLabelText("Current location")).toHaveTextContent("/crm?q=Acme");

    await user.click(screen.getByRole("button", { name: "Logout" }));
    expect(logout).toHaveBeenCalledOnce();
  });
});
