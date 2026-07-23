import { describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "../lib/prisma.js";
import { runRetention } from "./retention.js";

describe("data retention", () => {
  it("uses a PostgreSQL advisory lock before deleting expired records", async () => {
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
      refreshSession: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
      accountToken: { deleteMany: vi.fn().mockResolvedValue({ count: 3 }) },
      aiRequest: { deleteMany: vi.fn().mockResolvedValue({ count: 4 }) },
    };
    const database = {
      $transaction: vi.fn((operation) => operation(transaction)),
    } as unknown as DatabaseClient;

    await expect(runRetention(database)).resolves.toEqual({
      sessions: 2,
      accountTokens: 3,
      aiRequests: 4,
    });
    expect(transaction.$queryRaw).toHaveBeenCalledOnce();
  });

  it("does no work when another replica owns the retention lock", async () => {
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: false }]),
      refreshSession: { deleteMany: vi.fn() },
      accountToken: { deleteMany: vi.fn() },
      aiRequest: { deleteMany: vi.fn() },
    };
    const database = {
      $transaction: vi.fn((operation) => operation(transaction)),
    } as unknown as DatabaseClient;

    await expect(runRetention(database)).resolves.toBeNull();
    expect(transaction.refreshSession.deleteMany).not.toHaveBeenCalled();
  });
});
