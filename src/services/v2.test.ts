import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import * as v2 from "./v2";

const envelope = {
  data: {
    data: {
      cached: false,
      job: { id: "job-1" },
      duplicate: false,
      goal: { id: "goal-1" },
      campaigns: [],
      campaign: { id: "campaign-1" },
      tasks: [],
      task: { id: "task-1" },
      replies: [],
      profile: { id: "profile-1" },
      brief: { id: "brief-1" },
      users: [],
      tenants: [],
      user: { id: "user-1" },
      invitationDelivered: true,
      revoked: 2,
      budget: { mode: "LIMITED" },
      jobs: [],
      session: { id: "support-1" },
      config: { mode: "ASSISTED" },
      status: "RUNNING",
    },
  },
};

describe("V2 API client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, "get").mockResolvedValue(envelope as never);
    vi.spyOn(api, "post").mockResolvedValue(envelope as never);
    vi.spyOn(api, "put").mockResolvedValue(envelope as never);
    vi.spyOn(api, "patch").mockResolvedValue(envelope as never);
  });

  it("maps research, command, campaign, operations, and company responses", async () => {
    const signal = new AbortController().signal;
    await expect(v2.getResearchStatus(signal)).resolves.toBe(envelope.data.data);
    await expect(v2.createResearchJob({ query: "Acme", targetType: "COMPANY" })).resolves.toBe(envelope.data.data);
    await expect(v2.saveResearchCompany("result/1")).resolves.toBe(envelope.data.data);
    await expect(v2.createSalesGoal({ goal: "Find buyers", dailySendingLimit: 10 })).resolves.toEqual({ id: "goal-1" });
    await expect(v2.confirmSalesGoal("goal/1")).resolves.toEqual({ id: "goal-1" });
    await expect(v2.getCommandOverview(signal)).resolves.toBe(envelope.data.data);
    await expect(v2.getCampaigns(signal)).resolves.toEqual([]);
    await expect(v2.createCampaign({
      name: "Launch",
      salesGoal: "Find buyers",
      productService: "Platform",
      valueProposition: "Grounded research",
      senderIdentity: { displayName: "Sam", email: "sam@example.com" },
      tone: "Professional",
      dailySendingLimit: 10,
    })).resolves.toEqual({ id: "campaign-1" });
    await expect(v2.getTasks(signal)).resolves.toEqual([]);
    await expect(v2.updateTask("task/1", "COMPLETED")).resolves.toEqual({ id: "task-1" });
    await expect(v2.getAnalytics(signal)).resolves.toBe(envelope.data.data);
    await expect(v2.getInbox(signal)).resolves.toEqual([]);
    await expect(v2.getCompanyProfile(signal)).resolves.toEqual({ id: "profile-1" });
    await expect(v2.updateCompanyProfile({ companyName: "Acme" } as never)).resolves.toEqual({ id: "profile-1" });
    await expect(v2.approveCompanyProfile()).resolves.toEqual({ id: "profile-1" });
    await expect(v2.getDailySalesBrief(signal)).resolves.toEqual({ id: "brief-1" });

    expect(api.post).toHaveBeenCalledWith("/research/jobs", { query: "Acme", targetType: "COMPANY", confirmPaidSearch: true });
    expect(api.post).toHaveBeenCalledWith("/research/results/result%2F1/save");
    expect(api.post).toHaveBeenCalledWith("/command/goals/goal%2F1/confirm", { confirmed: true });
    expect(api.put).toHaveBeenCalledWith("/operations/tasks/task%2F1", { status: "COMPLETED" });
  });

  it("maps every privileged administration operation and safely encodes identifiers", async () => {
    const signal = new AbortController().signal;
    await expect(v2.getAdminOverview(signal)).resolves.toBe(envelope.data.data);
    await expect(v2.getAdminUsers(signal)).resolves.toEqual([]);
    await expect(v2.getAdminTenants(signal)).resolves.toEqual([]);
    await expect(v2.updateAdminUser("user/1", { status: "SUSPENDED" })).resolves.toBeUndefined();
    await expect(v2.createAdminUser({ name: "New User", email: "new@example.com", tenantId: "tenant-1" })).resolves.toBe(envelope.data.data);
    await expect(v2.revokeAdminUserSessions("user/1", "Security review")).resolves.toBe(2);
    await expect(v2.updateTenantAiBudget("tenant/1", { mode: "LIMITED", monthlyRequestLimit: 25, warningThresholdPercent: 80, reason: "Approved plan" })).resolves.toEqual({ mode: "LIMITED" });
    await expect(v2.getAdminJobs(signal)).resolves.toEqual([]);
    await expect(v2.getAdminSystem(signal)).resolves.toBe(envelope.data.data);
    await expect(v2.retryAdminJob("job/1", "Transient failure")).resolves.toBeUndefined();
    await expect(v2.cancelAdminJob("job/1", "Operator cancelled")).resolves.toBeUndefined();
    await expect(v2.createSupportSession({ targetUserId: "user-1", tenantId: "tenant-1", accessLevel: "READ_ONLY", reason: "Investigate customer issue", durationMinutes: 15 })).resolves.toEqual({ id: "support-1" });
    await expect(v2.endSupportSession("support/1", "Investigation complete")).resolves.toBeUndefined();

    expect(api.patch).toHaveBeenCalledWith("/admin/users/user%2F1", { status: "SUSPENDED" });
    expect(api.post).toHaveBeenCalledWith("/admin/users/user%2F1/revoke-sessions", { confirm: true, reason: "Security review" });
    expect(api.put).toHaveBeenCalledWith("/admin/tenants/tenant%2F1/ai-budget", expect.objectContaining({ confirm: true }));
    expect(api.post).toHaveBeenCalledWith("/admin/jobs/job%2F1/retry", { confirm: true, reason: "Transient failure" });
    expect(api.post).toHaveBeenCalledWith("/admin/support-sessions/support%2F1/end", { confirm: true, reason: "Investigation complete" });
  });

  it("maps sales department state transitions and bounded date ranges", async () => {
    const signal = new AbortController().signal;
    const range = { from: "2026-07-01T00:00:00.000Z", to: "2026-08-01T00:00:00.000Z" };
    await expect(v2.getSalesDepartmentStatus(signal, range)).resolves.toBe(envelope.data.data);
    await expect(v2.startSalesDepartment()).resolves.toBe(envelope.data.data);
    await expect(v2.updateSalesDepartmentConfig({ mode: "ASSISTED" } as never)).resolves.toEqual({ mode: "ASSISTED" });
    await expect(v2.pauseSalesDepartment("Human review")).resolves.toBe(envelope.data.data);

    expect(api.get).toHaveBeenCalledWith("/sales-department/status", { signal, params: range });
    expect(api.post).toHaveBeenCalledWith("/sales-department/start", { confirm: true });
    expect(api.post).toHaveBeenCalledWith("/sales-department/pause", { confirm: true, reason: "Human review" });
  });
});
