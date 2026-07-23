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

const monthFormatter = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" });

interface MonthlyLeadRow {
  month: Date;
  leads: number;
}

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
    const [statusGroups, monthlyRows] = await Promise.all([
      database.lead.groupBy({
        by: ["status"],
        where: { userId: request.user!.id },
        _count: { _all: true },
        _sum: { value: true },
      }),
      database.$queryRaw<MonthlyLeadRow[]>`
        SELECT date_trunc('month', "createdAt") AS month, COUNT(*)::integer AS leads
        FROM "Lead"
        WHERE "userId" = ${request.user!.id} AND "createdAt" >= ${firstMonth}
        GROUP BY date_trunc('month', "createdAt")
        ORDER BY month ASC
      `,
    ]);

    const counts = new Map(statusGroups.map((group) => [group.status, group._count._all]));
    const totalLeads = statusGroups.reduce((total, group) => total + group._count._all, 0);
    const closed = statusGroups.find((group) => group.status === "CLOSED");
    const revenue = Number(closed?._sum.value?.toString() ?? 0);
    const monthlyCounts = new Map(
      monthlyRows.map((entry) => [monthKey(new Date(entry.month)), Number(entry.leads)]),
    );
    const monthly = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(
        Date.UTC(firstMonth.getUTCFullYear(), firstMonth.getUTCMonth() + index, 1),
      );
      return {
        month: monthFormatter.format(date),
        leads: monthlyCounts.get(monthKey(date)) ?? 0,
      };
    });
    const status = Object.entries(statusLabels)
      .map(([key, name]) => ({ name, value: counts.get(key as keyof typeof statusLabels) ?? 0 }))
      .filter((entry) => entry.value > 0);

    response.json({
      data: {
        summary: {
          revenue,
          leads: totalLeads,
          meetings: counts.get("MEETING") ?? 0,
          closedDeals: counts.get("CLOSED") ?? 0,
        },
        monthly,
        status,
      },
    });
  });

  return router;
}
