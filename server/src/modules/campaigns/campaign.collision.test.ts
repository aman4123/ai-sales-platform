import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../../config/env.js";
import type { DatabaseClient } from "../../lib/prisma.js";
import { reserveGlobalRecipientDelivery } from "./campaign.routes.js";

function databaseFor(input: { recipientCount?: number; domainCount?: number; suppressed?: boolean }) {
  const recipient = {
    upsert: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    update: vi.fn().mockResolvedValue({
      globallySuppressedAt: input.suppressed ? new Date() : null,
      cooldownUntil: null,
      rollingDayCount: input.recipientCount ?? 1,
      rollingMonthCount: input.recipientCount ?? 1,
    }),
  };
  const domain = {
    upsert: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    update: vi.fn().mockResolvedValue({
      cooldownUntil: null,
      rollingDayCount: input.domainCount ?? 1,
      rollingMonthCount: input.domainCount ?? 1,
    }),
  };
  const transaction = { globalRecipientSafety: recipient, globalDomainSafety: domain };
  const database = {
    ...transaction,
    $transaction: vi.fn(async (operation: (client: typeof transaction) => unknown) => operation(transaction)),
  } as unknown as DatabaseClient;
  return { database, recipient, domain };
}

describe("privacy-preserving platform recipient collision controls", () => {
  const originalMode = env.OUTBOUND_DELIVERY_MODE;
  afterEach(() => { env.OUTBOUND_DELIVERY_MODE = originalMode; });

  it("allows a bounded live recipient without storing the address or domain", async () => {
    env.OUTBOUND_DELIVERY_MODE = "live";
    const { database, recipient, domain } = databaseFor({});
    await expect(reserveGlobalRecipientDelivery(database, "Person@Example.com", "USER")).resolves.toBe(true);
    expect(recipient.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { recipientHash: expect.stringMatching(/^[a-f0-9]{64}$/) } }));
    expect(domain.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { domainHash: expect.stringMatching(/^[a-f0-9]{64}$/) } }));
    expect(JSON.stringify(recipient.upsert.mock.calls)).not.toContain("person@example.com");
    expect(JSON.stringify(domain.upsert.mock.calls)).not.toContain("example.com");
  });

  it("returns only a generic denial after recipient, domain, or legal suppression limits", async () => {
    env.OUTBOUND_DELIVERY_MODE = "live";
    const recipientLimited = databaseFor({ recipientCount: env.PLATFORM_RECIPIENT_DAILY_LIMIT + 1 });
    await expect(reserveGlobalRecipientDelivery(recipientLimited.database, "one@example.com", "USER")).resolves.toBe(false);
    expect(recipientLimited.recipient.update).toHaveBeenCalledTimes(2);

    const domainLimited = databaseFor({ domainCount: env.PLATFORM_DOMAIN_DAILY_LIMIT + 1 });
    await expect(reserveGlobalRecipientDelivery(domainLimited.database, "two@example.com", "USER")).resolves.toBe(false);
    expect(domainLimited.domain.update).toHaveBeenCalledTimes(2);

    const suppressed = databaseFor({ suppressed: true });
    await expect(reserveGlobalRecipientDelivery(suppressed.database, "three@example.com", "USER")).resolves.toBe(false);
  });

  it("does not consume global production counters in isolated Tester Mode", async () => {
    env.OUTBOUND_DELIVERY_MODE = "live";
    const { database, recipient } = databaseFor({});
    await expect(reserveGlobalRecipientDelivery(database, "allowed@example.test", "TESTER")).resolves.toBe(true);
    expect(recipient.upsert).not.toHaveBeenCalled();
  });
});
