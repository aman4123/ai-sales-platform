import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import {
  confirmSalesGoal,
  createCampaign,
  createResearchJob,
  createSalesGoal,
  getAdminOverview,
  getAnalytics,
  getCampaigns,
  getCommandOverview,
  getInbox,
  getResearchStatus,
  getTasks,
  saveResearchCompany,
  updateTask,
} from "./v2";

vi.mock("./api", () => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));

describe("V2 API client", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps every GET response to its public data contract", async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: { data: { enabled: false } } })
      .mockResolvedValueOnce({ data: { data: { campaigns: [{ id: "campaign-1" }] } } })
      .mockResolvedValueOnce({ data: { data: { campaigns: [], currentTasks: [] } } })
      .mockResolvedValueOnce({ data: { data: { tasks: [{ id: "task-1" }] } } })
      .mockResolvedValueOnce({ data: { data: { replies: [{ id: "reply-1" }] } } })
      .mockResolvedValueOnce({ data: { data: { emailsSent: 1 } } })
      .mockResolvedValueOnce({ data: { data: { users: 1 } } });
    await expect(getResearchStatus()).resolves.toMatchObject({ enabled: false });
    await expect(getCampaigns()).resolves.toEqual([{ id: "campaign-1" }]);
    await expect(getCommandOverview()).resolves.toMatchObject({ campaigns: [] });
    await expect(getTasks()).resolves.toEqual([{ id: "task-1" }]);
    await expect(getInbox()).resolves.toEqual([{ id: "reply-1" }]);
    await expect(getAnalytics()).resolves.toMatchObject({ emailsSent: 1 });
    await expect(getAdminOverview()).resolves.toMatchObject({ users: 1 });
    expect(api.get).toHaveBeenNthCalledWith(5, "/operations/inbox?requiresHuman=true", { signal: undefined });
  });

  it("adds explicit confirmations to paid research and plan transitions", async () => {
    vi.mocked(api.post)
      .mockResolvedValueOnce({ data: { data: { job: { id: "job-1" }, cached: false } } })
      .mockResolvedValueOnce({ data: { data: { duplicate: false } } })
      .mockResolvedValueOnce({ data: { data: { goal: { id: "goal-1" } } } })
      .mockResolvedValueOnce({ data: { data: { goal: { id: "goal-1", status: "CONFIRMED" } } } });
    await createResearchJob({ query: "logistics", targetType: "COMPANY" });
    expect(api.post).toHaveBeenNthCalledWith(1, "/research/jobs", { query: "logistics", targetType: "COMPANY", confirmPaidSearch: true });
    await saveResearchCompany("result/1");
    expect(api.post).toHaveBeenNthCalledWith(2, "/research/results/result%2F1/save");
    await createSalesGoal({ goal: "Find logistics prospects", dailySendingLimit: 10 });
    await confirmSalesGoal("goal/1");
    expect(api.post).toHaveBeenNthCalledWith(4, "/command/goals/goal%2F1/confirm", { confirmed: true });
  });

  it("creates safe campaign defaults and updates task state", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { data: { campaign: { id: "campaign-1" } } } });
    vi.mocked(api.put).mockResolvedValueOnce({ data: { data: { task: { id: "task-1", status: "COMPLETED" } } } });
    await createCampaign({ name: "Campaign", salesGoal: "Goal", productService: "Product", valueProposition: "Value", senderIdentity: { displayName: "Sam", email: "sam@example.com" }, tone: "Professional", dailySendingLimit: 20 });
    expect(api.post).toHaveBeenCalledWith("/campaigns", expect.objectContaining({ audienceFilters: {}, sequenceConfig: { followUps: [] }, schedule: expect.objectContaining({ timezone: "UTC" }) }));
    await updateTask("task/1", "COMPLETED");
    expect(api.put).toHaveBeenCalledWith("/operations/tasks/task%2F1", { status: "COMPLETED" });
  });
});
