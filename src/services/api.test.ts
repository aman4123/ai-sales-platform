import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthPayload } from "../types/api";
import { api, apiErrorMessage, setAccessToken } from "./api";

const session: AuthPayload = {
  accessToken: "new-access-token",
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
};

function authorizationHeader(headers: unknown) {
  if (headers instanceof axios.AxiosHeaders) return headers.get("authorization");
  const values = headers as Record<string, string | undefined> | undefined;
  return values?.authorization ?? values?.Authorization;
}

describe("API session client", () => {
  let apiMock: MockAdapter;
  let axiosMock: MockAdapter;

  beforeEach(() => {
    apiMock = new MockAdapter(api);
    axiosMock = new MockAdapter(axios);
    setAccessToken(null);
  });

  afterEach(() => {
    apiMock.restore();
    axiosMock.restore();
    setAccessToken(null);
  });

  it("keeps access tokens in memory and attaches them to requests", async () => {
    setAccessToken("memory-only-token");
    apiMock.onGet("/protected").reply((config) => [
      200,
      { authorization: authorizationHeader(config.headers) },
    ]);

    const response = await api.get<{ authorization: string }>("/protected");
    expect(response.data.authorization).toBe("Bearer memory-only-token");
  });

  it("coalesces refresh work and retries an expired protected request", async () => {
    apiMock.onGet("/protected").replyOnce(401).onGet("/protected").reply((config) => [
      200,
      { authorization: authorizationHeader(config.headers) },
    ]);
    axiosMock.onPost("/api/auth/refresh").reply(200, { data: session });

    const response = await api.get<{ authorization: string }>("/protected");

    expect(response.data.authorization).toBe("Bearer new-access-token");
    expect(axiosMock.history.post).toHaveLength(1);
    expect(apiMock.history.get).toHaveLength(2);
  });

  it("announces session expiry when refresh fails", async () => {
    const expired = vi.fn();
    window.addEventListener("auth:expired", expired);
    apiMock.onGet("/protected").reply(401);
    axiosMock.onPost("/api/auth/refresh").reply(401);

    await expect(api.get("/protected")).rejects.toBeDefined();
    expect(expired).toHaveBeenCalledOnce();
    window.removeEventListener("auth:expired", expired);
  });

  it("prefers a safe server error message", () => {
    const error = new axios.AxiosError("Request failed", undefined, undefined, undefined, {
      data: { error: { message: "Validated server message" } },
      status: 400,
      statusText: "Bad Request",
      headers: {},
      config: { headers: new axios.AxiosHeaders() },
    });

    expect(apiErrorMessage(error, "Fallback")).toBe("Validated server message");
  });
});
