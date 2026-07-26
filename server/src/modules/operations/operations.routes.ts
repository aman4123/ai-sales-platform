import { Router } from "express";
import { z } from "zod";
import { NotFoundError } from "../../lib/errors.js";
import type { DatabaseClient } from "../../lib/prisma.js";

const idSchema = z.string().min(1).max(64);

export function createOperationsRouter(database: DatabaseClient) {
  const router = Router();

  router.get("/tasks", async (request, response) => {
    const status = z.enum(["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional().parse(request.query.status);
    const tasks = await database.task.findMany({
      where: { userId: request.user!.id, ...(status ? { status } : {}) },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 100,
    });
    response.json({ data: { tasks } });
  });

  router.put("/tasks/:id", async (request, response) => {
    const id = idSchema.parse(request.params.id);
    const input = z
      .object({ status: z.enum(["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"]) })
      .parse(request.body);
    const task = await database.task.findFirst({ where: { id, userId: request.user!.id } });
    if (!task) throw new NotFoundError("Task");
    const updated = await database.task.update({
      where: { id, userId: request.user!.id },
      data: {
        status: input.status,
        completedAt: input.status === "COMPLETED" ? new Date() : null,
      },
    });
    response.json({ data: { task: updated } });
  });

  router.get("/inbox", async (request, response) => {
    const requiresHuman = z
      .enum(["true", "false"])
      .optional()
      .transform((value) => (value === undefined ? undefined : value === "true"))
      .parse(request.query.requiresHuman);
    const replies = await database.reply.findMany({
      where: {
        userId: request.user!.id,
        ...(requiresHuman === undefined ? {} : { requiresHuman }),
      },
      orderBy: { receivedAt: "desc" },
      take: 100,
      include: {
        recipient: {
          select: {
            id: true,
            status: true,
            campaign: { select: { id: true, name: true } },
            contact: { select: { name: true, jobTitle: true } },
            lead: { select: { contact: true, company: true } },
          },
        },
      },
    });
    response.json({ data: { replies } });
  });

  router.get("/analytics", async (request, response) => {
    const userId = request.user!.id;
    const [researchJobs, verifiedLeads, recipients, messageGroups, replies, optedOut, humanTasks, campaigns] =
      await Promise.all([
        database.researchJob.count({ where: { userId, status: "COMPLETED" } }),
        database.lead.count({ where: { userId, confidence: { gt: 0 } } }),
        database.campaignRecipient.count({ where: { campaign: { userId } } }),
        database.campaignMessage.groupBy({
          by: ["status"],
          where: { userId },
          _count: { _all: true },
        }),
        database.reply.count({ where: { userId } }),
        database.optOut.count({ where: { userId } }),
        database.task.count({ where: { userId, type: "HUMAN_RESPONSE_REQUIRED", status: { not: "COMPLETED" } } }),
        database.campaign.groupBy({
          by: ["status"],
          where: { userId, deletedAt: null },
          _count: { _all: true },
        }),
      ]);
    const messages = Object.fromEntries(messageGroups.map((item) => [item.status, item._count._all]));
    const sent = Number(messages.SENT ?? 0) + Number(messages.DELIVERED ?? 0);
    response.json({
      data: {
        researchedLeads: researchJobs,
        verifiedLeads,
        approvedRecipients: recipients,
        emailsQueued: Number(messages.QUEUED ?? 0),
        emailsSent: sent,
        delivered: Number(messages.DELIVERED ?? 0),
        bounced: Number(messages.BOUNCED ?? 0),
        replied: replies,
        optedOut,
        humanTakeoverRequired: humanTasks,
        campaigns: Object.fromEntries(campaigns.map((item) => [item.status, item._count._all])),
        responseRate: sent > 0 ? replies / sent : 0,
        positiveResponseRate: null,
        unavailableMetrics: [
          "Email opens are unavailable until provider tracking is configured.",
          "Link clicks are unavailable until provider tracking is configured.",
          "Positive response rate requires manual reply classification.",
        ],
      },
    });
  });

  return router;
}
