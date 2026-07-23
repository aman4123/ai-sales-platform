import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createClient, client } = vi.hoisted(() => {
  const client = {
    isOpen: false,
    connect: vi.fn(),
    quit: vi.fn(),
    ping: vi.fn(),
    sendCommand: vi.fn(),
    on: vi.fn(),
  };
  return { createClient: vi.fn(() => client), client };
});

vi.mock("redis", () => ({ createClient }));

describe("Redis connection factory", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("keeps Redis optional outside production", async () => {
    vi.stubEnv("REDIS_URL", "");
    const { createRedisConnection } = await import("./redis.js");
    expect(createRedisConnection()).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("configures bounded reconnect behavior and error listeners", async () => {
    vi.stubEnv("REDIS_URL", "redis://cache.example.com:6379");
    const { createRedisConnection } = await import("./redis.js");

    expect(createRedisConnection()).toBe(client);
    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "redis://cache.example.com:6379",
        socket: expect.objectContaining({ connectTimeout: 5_000 }),
      }),
    );
    expect(client.on).toHaveBeenCalledWith("error", expect.any(Function));
    expect(client.on).toHaveBeenCalledWith("reconnecting", expect.any(Function));
  });
});
