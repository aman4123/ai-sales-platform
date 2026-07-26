import { Router } from "express";
import { z } from "zod";
import { NotFoundError } from "../../lib/errors.js";
import type { DatabaseClient } from "../../lib/prisma.js";
import { searchProviderConfiguration } from "../research/search.providers.js";

const goalSchema = z.object({
  goal: z.string().trim().min(5).max(1_000),
  productService: z.string().trim().max(500).optional(),
  targetIndustry: z.string().trim().max(160).optional(),
  geography: z.string().trim().max(160).optional(),
  preferredBuyerRole: z.string().trim().max(160).optional(),
  dailySendingLimit: z.number().int().min(1).max(100).default(25),
});
const idSchema = z.string().min(1).max(64);

function confirmedOrUnknown(value: string | undefined) {
  return value?.trim() || "Requires confirmation";
}

export function createCommandRouter(database: DatabaseClient) {
  const router = Router();

  router.get("/goals", async (request, response) => {
    const goals = await database.salesGoal.findMany({
      where: { userId: request.user!.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    response.json({ data: { goals } });
  });

  router.post("/goals", async (request, response) => {
    const input = goalSchema.parse(request.body);
    const search = searchProviderConfiguration();
    const targetMarket = {
      industry: confirmedOrUnknown(input.targetIndustry),
      geography: confirmedOrUnknown(input.geography),
      buyerRole: confirmedOrUnknown(input.preferredBuyerRole),
    };
    const plan = {
      objective: input.goal,
      targetMarket,
      icp: {
        productService: confirmedOrUnknown(input.productService),
        fit: "Possible fit only; company-specific fit requires evidence.",
      },
      researchStrategy: search.configured
        ? "Use the configured provider, retain source evidence, and reject unsupported facts."
        : search.message,
      expectedDataSources: search.configured
        ? [search.provider, "Official websites when returned by search", "Public professional sources"]
        : [],
      leadCriteria: [
        "Industry and geography match",
        "Sufficient source evidence",
        "No suppression or opt-out",
      ],
      emailApproach: "Grounded draft using verified facts, reviewed by a human before sending.",
      followUpPlan: "At most two pre-approved follow-ups; stop on reply, opt-out, bounce, or pause.",
      limits: {
        dailySendingLimit: input.dailySendingLimit,
        paidSearchRequiresConfirmation: true,
        outreachRequiresApproval: true,
      },
      risks: [
        "Live provider results may be incomplete or stale",
        "Decision-maker details require public professional evidence",
        "Local anti-spam and privacy requirements must be confirmed by the user",
      ],
      requiredApprovals: [
        "Paid search",
        "Recipient list",
        "Message content and sender identity",
        "Follow-up sequence",
        "Campaign launch",
      ],
    };
    const goal = await database.salesGoal.create({
      data: {
        userId: request.user!.id,
        statement: input.goal,
        objective: input.goal,
        targetMarket,
        plan,
      },
    });
    response.status(201).json({ data: { goal } });
  });

  router.post("/goals/:id/confirm", async (request, response) => {
    const id = idSchema.parse(request.params.id);
    z.object({ confirmed: z.literal(true) }).parse(request.body);
    const existing = await database.salesGoal.findFirst({
      where: { id, userId: request.user!.id },
    });
    if (!existing) throw new NotFoundError("Sales goal");
    const goal = await database.salesGoal.update({
      where: { id, userId: request.user!.id },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
    });
    response.json({ data: { goal } });
  });

  router.get("/overview", async (request, response) => {
    const userId = request.user!.id;
    const [campaigns, tasks, researchJobs, pendingApprovals, aiRequests, searchUsage] =
      await Promise.all([
        database.campaign.findMany({
          where: { userId, deletedAt: null },
          select: { id: true, name: true, status: true, updatedAt: true },
          orderBy: { updatedAt: "desc" },
          take: 10,
        }),
        database.task.findMany({
          where: { userId, status: { in: ["OPEN", "IN_PROGRESS"] } },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
        database.researchJob.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
        database.campaign.count({
          where: { userId, status: "READY_FOR_REVIEW", deletedAt: null },
        }),
        database.aiRequest.count({
          where: { userId, createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
        }),
        database.searchUsage.aggregate({ where: { userId }, _sum: { count: true } }),
      ]);
    response.json({
      data: {
        campaigns,
        currentTasks: tasks,
        recentResearch: researchJobs,
        pendingApprovals,
        humanResponsesNeeded: tasks.filter((task) => task.type === "HUMAN_RESPONSE_REQUIRED").length,
        usage: { aiRequestsLast30Days: aiRequests, searchRequests: searchUsage._sum.count ?? 0 },
      },
    });
  });

  return router;
}
