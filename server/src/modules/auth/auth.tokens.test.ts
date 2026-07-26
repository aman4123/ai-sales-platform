import { afterEach, describe, expect, it } from "vitest";
import { env } from "../../config/env.js";
import { signAccessToken, verifyAccessToken } from "./auth.tokens.js";

const originalEnvironment = env.NODE_ENV;
const originalTesterMode = env.TESTER_MODE_ENABLED;

describe("signed access modes", () => {
  afterEach(() => {
    env.NODE_ENV = originalEnvironment;
    env.TESTER_MODE_ENABLED = originalTesterMode;
  });

  it.each([
    ["USER", "USER"],
    ["TESTER", "ADMIN"],
    ["MASTER_ADMIN", "SUPER_ADMIN"],
  ] as const)("maps %s to the expected effective role", (accessMode, role) => {
    env.NODE_ENV = "test";
    const verified = verifyAccessToken(signAccessToken(
      { id: "master-1", email: "master@example.com", role: "SUPER_ADMIN" },
      "session-1",
      accessMode,
    ));
    expect(verified).toMatchObject({
      role,
      accountRole: "SUPER_ADMIN",
      accessMode,
      sessionId: "session-1",
    });
  });

  it("never lets a regular user escalate by requesting Master Admin mode", () => {
    env.NODE_ENV = "test";
    const verified = verifyAccessToken(signAccessToken(
      { id: "user-1", email: "user@example.com", role: "USER" },
      "session-1",
      "MASTER_ADMIN",
    ));
    expect(verified).toMatchObject({ role: "USER", accountRole: "USER", accessMode: "USER" });
  });

  it("disables tester impersonation in production unless explicitly enabled", () => {
    env.NODE_ENV = "production";
    env.TESTER_MODE_ENABLED = false;
    const verified = verifyAccessToken(signAccessToken(
      { id: "master-1", email: "master@example.com", role: "SUPER_ADMIN" },
      "session-1",
      "TESTER",
    ));
    expect(verified).toMatchObject({ role: "SUPER_ADMIN", accessMode: "MASTER_ADMIN" });
  });
});
