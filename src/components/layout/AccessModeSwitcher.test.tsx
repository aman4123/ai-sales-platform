import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useAuth } from "../../contexts/auth-context";
import AccessModeSwitcher from "./AccessModeSwitcher";

vi.mock("../../contexts/auth-context", () => ({ useAuth: vi.fn() }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

describe("Master Admin access switcher", () => {
  it("switches through the server-backed session API", async () => {
    const switchMode = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: "master-1",
        email: "master@example.com",
        emailVerified: true,
        name: "Master Tester",
        role: "SUPER_ADMIN",
        accountRole: "SUPER_ADMIN",
        accessMode: "MASTER_ADMIN",
        availableModes: ["USER", "TESTER", "MASTER_ADMIN"],
        settings: { company: "", signature: "", aiProvider: "MOCK", theme: "DARK", notifications: true },
      },
      loading: false,
      login: vi.fn(),
      register: vi.fn(),
      acceptSession: vi.fn(),
      switchMode,
      logout: vi.fn(),
      updateUser: vi.fn(),
    });

    render(<AccessModeSwitcher />);
    await userEvent.selectOptions(screen.getByLabelText("Testing access mode"), "TESTER");
    expect(switchMode).toHaveBeenCalledWith("TESTER");
  });
});
