import { render, screen, waitFor } from "@testing-library/react";
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
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    logout.mockReset();
    mockedUseAuth.mockReturnValue({
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
      loading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout,
      acceptSession: vi.fn(),
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

    const navigation = screen.getByLabelText("Primary navigation");
    expect(navigation).toHaveAttribute("inert");
    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(navigation).not.toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("hidden");
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByRole("button", { name: "Close navigation" })).not.toHaveLength(0);
    expect(document.activeElement).toHaveAccessibleName("Close navigation");
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Logout" })).toHaveFocus();
    await user.tab();
    await user.keyboard("{Escape}");
    expect(navigation).toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Open navigation" })).toHaveFocus();
    });
    await user.click(screen.getByRole("button", { name: "Open navigation" }));

    const search = screen.getByRole("searchbox", { name: "Search CRM" });
    await user.type(search, "Acme{enter}");
    expect(screen.getByLabelText("Current location")).toHaveTextContent("/crm?q=Acme");

    await user.click(screen.getByRole("button", { name: "Logout" }));
    expect(logout).toHaveBeenCalledOnce();
  });
});
