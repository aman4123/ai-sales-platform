import { createClient } from "redis";
import type { RedisReply } from "rate-limit-redis";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

export interface RedisClient {
  readonly isOpen: boolean;
  connect(): Promise<unknown>;
  quit(): Promise<unknown>;
  ping(): Promise<string>;
  sendCommand(arguments_: string[]): Promise<RedisReply>;
}

export function createRedisConnection(): RedisClient | null {
  if (!env.REDIS_URL) return null;

  const client = createClient({
    url: env.REDIS_URL,
    socket: {
      connectTimeout: env.REDIS_CONNECT_TIMEOUT_MS,
      reconnectStrategy: (retries) => Math.min(100 * 2 ** retries, 3_000),
    },
  });
  client.on("error", (error) => logger.error({ err: error }, "Redis client error"));
  client.on("reconnecting", () => logger.warn("Redis client reconnecting"));
  return client as unknown as RedisClient;
}
