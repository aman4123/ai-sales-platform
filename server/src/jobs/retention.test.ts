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
      userSettings: { findMany: vi.fn().mockResolvedValue([{ userId: "user-1", dataRetentionDays: 90 }]) },
      researchJob: { deleteMany: vi.fn().mockResolvedValue({ count: 5 }) },
      deliveryEvent: { deleteMany: vi.fn().mockResolvedValue({ count: 6 }) },
      reply: { updateMany: vi.fn().mockResolvedValue({ count: 7 }) },
    };
    const database = {
      $transaction: vi.fn((operation) => operation(transaction)),
    } as unknown as DatabaseClient;

    await expect(runRetention(database)).resolves.toEqual({
      sessions: 2,
      accountTokens: 3,
      aiRequests: 4,
      researchJobs: 5,
      deliveryEvents: 6,
      replyPreviewsCleared: 7,
    });
    expect(transaction.$queryRaw).toHaveBeenCalledOnce();
  });

  it("does no work when another replica owns the retention lock", async () => {
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: false }]),
      refreshSession: { deleteMany: vi.fn() },
      accountToken: { deleteMany: vi.fn() },
      aiRequest: { deleteMany: vi.fn() },
      userSettings: { findMany: vi.fn() },
    };
    const database = {
      $transaction: vi.fn((operation) => operation(transaction)),
    } as unknown as DatabaseClient;

    await expect(runRetention(database)).resolves.toBeNull();
    expect(transaction.refreshSession.deleteMany).not.toHaveBeenCalled();
  });
});
