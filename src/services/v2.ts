import { api } from "./api";

export interface ResearchStatus {
  enabled: boolean;
  provider: "TAVILY" | "BRAVE" | "SERPER";
  configured: boolean;
  message: string;
}

export interface EvidenceItem {
  id: string;
  field: string;
  value: string;
  sourceUrl: string;
  sourceTitle: string;
  sourceType: string;
  retrievedAt: string;
  confidence: number;
  verificationStatus: string;
  quotedSnippet?: string | null;
  isPrimarySource: boolean;
}

export interface CompanyResearchResult {
  id: string;
  companyName: string | null;
  legalName: string | null;
  website: string | null;
  domain: string | null;
  industry: string | null;
  description: string | null;
  headquarters: string | null;
  publicPhone: string | null;
  publicEmail: string | null;
  unknownFields: string[];
  confidenceScore: number;
  riskFlags: string[];
  salesAnalysis: {
    label?: string;
    statements?: Array<{ statement: string; type: "INFERENCE"; evidenceIds: string[] }>;
    rejectedUnsupportedFacts?: number;
  } | null;
  staleAt: string | null;
  evidence: EvidenceItem[];
}

export interface ResearchJob {
  id: string;
  query: string;
  targetType: string;
  status: string;
  provider: string | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  results: CompanyResearchResult[];
}

export async function getResearchStatus(signal?: AbortSignal) {
  const response = await api.get<{ data: ResearchStatus }>("/research/status", { signal });
  return response.data.data;
}

export async function createResearchJob(input: {
  query: string;
  targetType: "COMPANY" | "MARKET" | "CONTACT";
}) {
  const response = await api.post<{ data: { job: ResearchJob; cached: boolean } }>(
    "/research/jobs",
    { ...input, confirmPaidSearch: true },
  );
  return response.data.data;
}

export async function saveResearchCompany(resultId: string) {
  const response = await api.post<{ data: { duplicate: boolean } }>(
    `/research/results/${encodeURIComponent(resultId)}/save`,
  );
  return response.data.data;
}

export interface CommandPlan {
  objective: string;
  targetMarket: Record<string, string>;
  icp: Record<string, string>;
  researchStrategy: string;
  expectedDataSources: string[];
  leadCriteria: string[];
  emailApproach: string;
  followUpPlan: string;
  limits: Record<string, number | boolean>;
  risks: string[];
  requiredApprovals: string[];
}

export interface SalesGoal {
  id: string;
  statement: string;
  status: "DRAFT" | "CONFIRMED" | "ARCHIVED";
  plan: CommandPlan;
  createdAt: string;
}

export async function createSalesGoal(input: {
  goal: string;
  productService?: string;
  targetIndustry?: string;
  geography?: string;
  preferredBuyerRole?: string;
  dailySendingLimit: number;
}) {
  const response = await api.post<{ data: { goal: SalesGoal } }>("/command/goals", input);
  return response.data.data.goal;
}

export async function confirmSalesGoal(id: string) {
  const response = await api.post<{ data: { goal: SalesGoal } }>(
    `/command/goals/${encodeURIComponent(id)}/confirm`,
    { confirmed: true },
  );
  return response.data.data.goal;
}

export interface CommandOverview {
  campaigns: Array<{ id: string; name: string; status: string; updatedAt: string }>;
  currentTasks: Array<{ id: string; type: string; status: string; title: string; createdAt: string }>;
  recentResearch: Array<{ id: string; query: string; status: string; createdAt: string }>;
  pendingApprovals: number;
  humanResponsesNeeded: number;
  usage: { aiRequestsLast30Days: number; searchRequests: number };
}

export async function getCommandOverview(signal?: AbortSignal) {
  const response = await api.get<{ data: CommandOverview }>("/command/overview", { signal });
  return response.data.data;
}

export interface CampaignSummary {
  id: string;
  name: string;
  salesGoal: string;
  productService: string;
  status: string;
  contentVersion: number;
  approvedVersion: number | null;
  dailySendingLimit: number;
  createdAt: string;
  _count: { recipients: number; messages: number; approvals: number };
}

export async function getCampaigns(signal?: AbortSignal) {
  const response = await api.get<{ data: { campaigns: CampaignSummary[] } }>("/campaigns", {
    signal,
  });
  return response.data.data.campaigns;
}

export async function createCampaign(input: {
  name: string;
  salesGoal: string;
  productService: string;
  valueProposition: string;
  senderIdentity: { displayName: string; email: string };
  tone: "Professional" | "Friendly" | "Sales" | "Formal";
  dailySendingLimit: number;
}) {
  const response = await api.post<{ data: { campaign: CampaignSummary } }>("/campaigns", {
    ...input,
    audienceFilters: {},
    sequenceConfig: { followUps: [] },
    schedule: { timezone: "UTC", weekdays: [1, 2, 3, 4, 5], windowStart: "09:00", windowEnd: "17:00" },
  });
  return response.data.data.campaign;
}

export interface TaskItem {
  id: string;
  type: string;
  status: "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  title: string;
  description: string | null;
  createdAt: string;
}

export async function getTasks(signal?: AbortSignal) {
  const response = await api.get<{ data: { tasks: TaskItem[] } }>("/operations/tasks", { signal });
  return response.data.data.tasks;
}

export async function updateTask(id: string, status: TaskItem["status"]) {
  const response = await api.put<{ data: { task: TaskItem } }>(
    `/operations/tasks/${encodeURIComponent(id)}`,
    { status },
  );
  return response.data.data.task;
}

export interface AnalyticsData {
  researchedLeads: number;
  verifiedLeads: number;
  approvedRecipients: number;
  emailsQueued: number;
  emailsSent: number;
  delivered: number;
  bounced: number;
  replied: number;
  optedOut: number;
  humanTakeoverRequired: number;
  responseRate: number;
  positiveResponseRate: number | null;
  unavailableMetrics: string[];
}

export async function getAnalytics(signal?: AbortSignal) {
  const response = await api.get<{ data: AnalyticsData }>("/operations/analytics", { signal });
  return response.data.data;
}

export interface InboxReply {
  id: string;
  classification: string | null;
  contentPreview: string | null;
  requiresHuman: boolean;
  receivedAt: string;
  recipient: {
    id: string;
    status: string;
    campaign: { id: string; name: string };
    contact: { name: string; jobTitle: string | null } | null;
    lead: { contact: string; company: string } | null;
  };
}

export async function getInbox(signal?: AbortSignal) {
  const response = await api.get<{ data: { replies: InboxReply[] } }>(
    "/operations/inbox?requiresHuman=true",
    { signal },
  );
  return response.data.data.replies;
}

export interface AdminOverview {
  users: number;
  activeUsers: number;
  aiRequests: number;
  searchRequests: number;
  emailSends: number;
  failedJobs: number;
  providerHealth: {
    search: { enabled: boolean; configured: boolean; provider: string; message: string };
    ai: { provider: string; configured: boolean };
    email: { provider: string; outboundEnabled: boolean };
  };
  monthlyBudget: { aiRequests: number; searchRequests: number; outboundDailyLimit: number };
  abuseFlags: number;
  campaignActivity: Record<string, number>;
  auditLogs: Array<{
    id: string;
    actorUserId: string | null;
    action: string;
    resourceType: string;
    resourceId: string | null;
    requestId: string | null;
    createdAt: string;
  }>;
}

export async function getAdminOverview(signal?: AbortSignal) {
  const response = await api.get<{ data: AdminOverview }>("/admin/overview", { signal });
  return response.data.data;
}
