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
    vi.stubEnv("REDIS_URL", "rediss://default:secure-password@cache.upstash.io:6379");
    vi.stubEnv("REDIS_CONNECT_RETRIES", "3");
    const { createRedisConnection } = await import("./redis.js");

    expect(createRedisConnection()).toBe(client);
    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "rediss://default:secure-password@cache.upstash.io:6379",
        socket: expect.objectContaining({ connectTimeout: 5_000 }),
      }),
    );
    expect(client.on).toHaveBeenCalledWith("error", expect.any(Function));
    expect(client.on).toHaveBeenCalledWith("reconnecting", expect.any(Function));

    const options = createClient.mock.calls[0]?.[0] as {
      socket: { reconnectStrategy: (retries: number) => number | false };
    };
    expect(options.socket.reconnectStrategy(0)).toBe(100);
    expect(options.socket.reconnectStrategy(3)).toBe(false);
  });

  it("returns the connected Redis client for distributed production limits", async () => {
    vi.stubEnv("REDIS_URL", "rediss://default:secure-password@cache.upstash.io:6379");
    const { connectRedisOrFallback, createRedisConnection } = await import("./redis.js");
    const connection = createRedisConnection();

    await expect(connectRedisOrFallback(connection, "production")).resolves.toBe(client);
    expect(client.connect).toHaveBeenCalledOnce();
  });

  it("fails closed when production Redis is not configured", async () => {
    vi.stubEnv("REDIS_URL", "");
    const { connectRedisOrFallback } = await import("./redis.js");

    await expect(connectRedisOrFallback(null, "production"))
      .rejects.toThrow("Redis is required in production");
  });

  it("logs and uses the in-memory limiter when Redis is unavailable outside production", async () => {
    vi.stubEnv("REDIS_URL", "redis://cache.example.com:6379");
    client.connect.mockRejectedValueOnce(new Error("cache unavailable"));
    const { connectRedisOrFallback, createRedisConnection } = await import("./redis.js");

    await expect(connectRedisOrFallback(createRedisConnection(), "development")).resolves.toBeNull();
  });

  it("fails closed when Redis is unavailable in production", async () => {
    vi.stubEnv("REDIS_URL", "rediss://default:secure-password@cache.upstash.io:6379");
    client.connect.mockRejectedValueOnce(new Error("cache unavailable"));
    const { connectRedisOrFallback, createRedisConnection } = await import("./redis.js");

    await expect(connectRedisOrFallback(createRedisConnection(), "production"))
      .rejects.toThrow("cache unavailable");
  });
});
