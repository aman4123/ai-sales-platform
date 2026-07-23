import { Router } from "express";
import type { DatabaseClient } from "../../lib/prisma.js";

const statusLabels = {
  INTERESTED: "Interested",
  MEETING: "Meeting",
  FOLLOW_UP: "Follow Up",
  PROPOSAL_SENT: "Proposal Sent",
  CLOSED: "Closed",
  LOST: "Lost",
} as const;

function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function createReportRouter(database: DatabaseClient) {
  const router = Router();

  router.get("/summary", async (request, response) => {
    const now = new Date();
    const firstMonth = startOfUtcMonth(
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1)),
    );
    const leads = await database.lead.findMany({
      where: { userId: request.user!.id },
      select: { status: true, value: true, createdAt: true },
    });

    const statusCounts = new Map<string, number>();
    let revenue = 0;
    for (const lead of leads) {
      statusCounts.set(lead.status, (statusCounts.get(lead.status) ?? 0) + 1);
      if (lead.status === "CLOSED") revenue += Number(lead.value.toString());
    }

    const monthly = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(
        Date.UTC(firstMonth.getUTCFullYear(), firstMonth.getUTCMonth() + index, 1),
      );
      return {
        key: monthKey(date),
        month: new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(date),
        leads: 0,
      };
    });
    const monthlyByKey = new Map(monthly.map((entry) => [entry.key, entry]));

    for (const lead of leads) {
      if (lead.createdAt >= firstMonth) {
        const entry = monthlyByKey.get(monthKey(lead.createdAt));
        if (entry) entry.leads += 1;
      }
    }

    const status = Object.entries(statusLabels)
      .map(([key, name]) => ({ name, value: statusCounts.get(key) ?? 0 }))
      .filter((entry) => entry.value > 0);

    response.json({
      data: {
        summary: {
          revenue,
          leads: leads.length,
          meetings: statusCounts.get("MEETING") ?? 0,
          closedDeals: statusCounts.get("CLOSED") ?? 0,
        },
        monthly: monthly.map(({ month, leads: count }) => ({ month, leads: count })),
        status,
      },
    });
  });

  return router;
}
