import { api } from "./api";

export interface ResearchStatus {
  enabled: boolean;
  provider: "TAVILY" | "BRAVE" | "SERPER";
  configured: boolean;
  requiredEnvironmentVariable: string;
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

export interface CompanyProfile {
  id?: string;
  tenantId: string;
  status: "DRAFT" | "APPROVED";
  version: number;
  companyName: string;
  website: string | null;
  industry: string | null;
  description: string | null;
  products: string[];
  services: string[];
  useCases: string[];
  pricingSummary: string | null;
  targetIndustries: string[];
  targetCompanySizes: string[];
  targetJobTitles: string[];
  targetLocations: string[];
  exclusions: string[];
  valuePropositions: string[];
  competitors: string[];
  caseStudies: Array<{ title: string; summary: string; sourceUrl?: string }>;
  testimonials: Array<{ quote: string; attribution: string; sourceUrl?: string }>;
  faqs: Array<{ question: string; answer: string }>;
  commonObjections: Array<{ objection: string; approvedResponse: string }>;
  knowledgeSources: Array<{
    title: string;
    url: string;
    type: "WEBSITE" | "DOCUMENT" | "CASE_STUDY" | "FAQ" | "OTHER";
  }>;
  preferredTone: "Professional" | "Friendly" | "Formal" | "Concise" | "Consultative";
  complianceRequirements: string[];
  contactDetails: { email: string; phone: string; address: string };
  meetingPreferences: { timezone: string; schedulingUrl: string; assignedCloser: string };
  approvedAt: string | null;
  updatedAt: string | null;
}

export type CompanyProfileInput = Omit<
  CompanyProfile,
  "id" | "tenantId" | "status" | "version" | "approvedAt" | "updatedAt"
>;

export async function getCompanyProfile(signal?: AbortSignal) {
  const response = await api.get<{ data: { profile: CompanyProfile } }>(
    "/settings/company-profile",
    { signal },
  );
  return response.data.data.profile;
}

export async function updateCompanyProfile(input: CompanyProfileInput) {
  const response = await api.put<{ data: { profile: CompanyProfile } }>(
    "/settings/company-profile",
    input,
  );
  return response.data.data.profile;
}

export async function approveCompanyProfile() {
  const response = await api.post<{ data: { profile: CompanyProfile } }>(
    "/settings/company-profile/approve",
    { confirm: true },
  );
  return response.data.data.profile;
}

export interface DailySalesBrief {
  id: string;
  briefDate: string;
  generatedAt: string;
  dataLabel: "REAL" | "TEST" | "ESTIMATED" | "PROJECTED" | "DEMO";
  metrics: {
    leadsDiscovered: number;
    researchCompleted: number;
    qualifiedLeads: number;
    outreachSent: number;
    repliesReceived: number;
    interestedProspects: number;
    meetings: number;
    opportunitiesCreated: number;
    pipelineValue: number;
    deliveriesConfirmed: number;
    wonCustomers: number;
    revenue: number;
    revenueCurrency: string;
    aiRequests: number;
    searchRequestsRecorded: number;
    estimatedAiCostMinor: number;
    externalProviderCostsAvailable: boolean;
  };
  failures: string[];
  risks: string[];
  approvals: string[];
  priorities: string[];
}

export async function getDailySalesBrief(signal?: AbortSignal) {
  const response = await api.get<{ data: { brief: DailySalesBrief } }>(
    "/operations/daily-brief",
    { signal },
  );
  return response.data.data.brief;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  emailVerifiedAt: string | null;
  role: string;
  status: "ACTIVE" | "SUSPENDED" | "DELETED";
  lastLoginAt: string | null;
  lastActiveAt: string | null;
  createdAt: string;
  tenantMemberships: Array<{
    role: string;
    tenant: { id: string; name: string; slug: string; status: string };
  }>;
  _count: { sessions: number; aiRequests: number; campaigns: number };
}

export interface AdminTenant {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
  kind: "CUSTOMER" | "INTERNAL" | "TEST";
  owner: { id: string; name: string; email: string } | null;
  subscription: {
    id: string;
    status: string;
    plan: { code: string; name: string };
  } | null;
  aiBudget: {
    id: string;
    mode: "DISABLED" | "LIMITED" | "INTERNAL_UNLIMITED";
    monthlyRequestLimit: number;
    warningThresholdPercent: number;
  } | null;
  companyProfile: {
    status: string;
    version: number;
    companyName: string;
    updatedAt: string;
  } | null;
  _count: { memberships: number; dailyBriefs: number };
}

export async function getAdminUsers(signal?: AbortSignal) {
  const response = await api.get<{ data: { users: AdminUser[] } }>("/admin/users", { signal });
  return response.data.data.users;
}

export async function getAdminTenants(signal?: AbortSignal) {
  const response = await api.get<{ data: { tenants: AdminTenant[] } }>("/admin/tenants", { signal });
  return response.data.data.tenants;
}

export async function updateAdminUser(
  userId: string,
  input: { status?: AdminUser["status"]; role?: "USER" | "MEMBER" | "ADMIN"; verified?: boolean },
) {
  await api.patch(`/admin/users/${encodeURIComponent(userId)}`, input);
}

export async function createAdminUser(input: {
  name: string;
  email: string;
  tenantId?: string;
  tenantRole?: "TENANT_ADMIN" | "SALES_MANAGER" | "SALES_USER" | "REVIEWER" | "BILLING_ADMIN" | "VIEWER";
}) {
  const response = await api.post<{
    data: { user: Pick<AdminUser, "id" | "name" | "email" | "status">; invitationDelivered: boolean };
  }>("/admin/users", input);
  return response.data.data;
}

export async function revokeAdminUserSessions(userId: string, reason: string) {
  const response = await api.post<{ data: { revoked: number } }>(
    `/admin/users/${encodeURIComponent(userId)}/revoke-sessions`,
    { confirm: true, reason },
  );
  return response.data.data.revoked;
}

export async function updateTenantAiBudget(
  tenantId: string,
  input: {
    mode: "DISABLED" | "LIMITED" | "INTERNAL_UNLIMITED";
    monthlyRequestLimit: number;
    warningThresholdPercent: number;
    reason: string;
  },
) {
  const response = await api.put<{ data: { budget: AdminTenant["aiBudget"] } }>(
    `/admin/tenants/${encodeURIComponent(tenantId)}/ai-budget`,
    { ...input, confirm: true },
  );
  return response.data.data.budget;
}

export interface AdminAutomationJob {
  id: string;
  tenantId: string;
  category: string;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  scheduledAt: string;
  nextAttemptAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface AdminSystemStatus {
  database: "UP" | "DOWN";
  redis: "UP" | "DOWN" | "NOT_CONFIGURED";
  webService: "UP" | "DOWN";
  worker: string;
  deploymentVersion: string;
  providers: {
    ai: { configured: boolean; model: string };
    search: ResearchStatus;
    email: { enabled: boolean; mode: string; provider: string };
  };
  jobs: Record<string, number>;
  salesDepartments: Record<string, number>;
}

export async function getAdminJobs(signal?: AbortSignal) {
  const response = await api.get<{ data: { jobs: AdminAutomationJob[] } }>("/admin/jobs?limit=100", { signal });
  return response.data.data.jobs;
}

export async function getAdminSystem(signal?: AbortSignal) {
  const response = await api.get<{ data: AdminSystemStatus }>("/admin/system", { signal });
  return response.data.data;
}

export async function retryAdminJob(id: string, reason: string) {
  await api.post(`/admin/jobs/${encodeURIComponent(id)}/retry`, { confirm: true, reason });
}

export async function cancelAdminJob(id: string, reason: string) {
  await api.post(`/admin/jobs/${encodeURIComponent(id)}/cancel`, { confirm: true, reason });
}

export interface AdminSupportSession {
  id: string;
  targetUserId: string;
  tenantId: string;
  accessLevel: "READ_ONLY" | "WRITE";
  reason: string;
  startedAt: string;
  expiresAt: string;
  endedAt: string | null;
}

export async function createSupportSession(input: {
  targetUserId: string;
  tenantId: string;
  accessLevel: "READ_ONLY" | "WRITE";
  reason: string;
  durationMinutes: number;
}) {
  const response = await api.post<{ data: { session: AdminSupportSession } }>(
    "/admin/support-sessions",
    { ...input, confirm: true },
  );
  return response.data.data.session;
}

export async function endSupportSession(id: string, reason: string) {
  await api.post(`/admin/support-sessions/${encodeURIComponent(id)}/end`, {
    confirm: true,
    reason,
  });
}

export interface SalesDepartmentStatus {
  workspace: {
    id: string;
    name: string;
    kind: "CUSTOMER" | "INTERNAL" | "TEST";
    dataLabel: "REAL" | "TEST";
  };
  range: { from: string; to: string; label: string };
  config: {
    mode: "MANUAL" | "ASSISTED" | "AUTONOMOUS";
    status: "DRAFT" | "READY" | "RUNNING" | "PAUSED" | "BLOCKED" | "STOPPED";
    outreachGoal: string;
    searchLocations: string[];
    approvedClaims: string[];
    prohibitedClaims: string[];
    approvalPolicy: SalesDepartmentConfigInput["approvalPolicy"];
    dailyContactLimit: number;
    monthlyContactLimit: number;
    maximumFollowUps: number;
    maximumRetries: number;
    quietHours: SalesDepartmentConfigInput["quietHours"];
    budgetMinor: number;
    currency: string;
    senderIdentity: SalesDepartmentConfigInput["senderIdentity"];
    senderVerified: boolean;
    humanMeetingOwner: string;
  };
  canStart: boolean;
  blockers: Array<{ code: string; message: string; blocking: boolean }>;
  providers: {
    research: ResearchStatus;
    ai: { configured: boolean; selected: string; model: string };
    email: { enabled: boolean; mode: "disabled" | "test" | "live" };
  };
  metrics: {
    leadsDiscovered: number;
    leadsVerified: number;
    qualifiedProspects: number;
    outreachAwaitingApproval: number;
    outreachSent: number;
    deliveriesConfirmed: number;
    replies: number;
    interestedProspects: number;
    meetings: number;
    opportunities: number;
    wonCustomers: number;
    revenue: number;
    revenueCurrency: string;
    humanActions: number;
    aiRequests: number;
    searchRequests: number;
    estimatedAiCostMinor: number;
    externalProviderCostsAvailable: boolean;
  };
  currentBlocker: { code: string; message: string; blocking: boolean } | null;
  recommendedNextAction: string;
  employees: Array<{
    key: string;
    name: string;
    role: string;
    job: string;
    status: string;
    currentTask: string | null;
    errorState: string | null;
    kpi: string;
  }>;
  recentJobs: Array<{
    id: string;
    category: string;
    status: string;
    errorCode: string | null;
    createdAt: string;
    completedAt: string | null;
  }>;
}

export interface SalesDepartmentConfigInput {
  mode: "MANUAL" | "ASSISTED" | "AUTONOMOUS";
  outreachGoal: string;
  searchLocations: string[];
  approvedClaims: string[];
  prohibitedClaims: string[];
  approvalPolicy: {
    newAudience: boolean;
    firstOutreach: boolean;
    sensitiveReplies: boolean;
    pricing: boolean;
    proposals: boolean;
    contracts: boolean;
  };
  dailyContactLimit: number;
  monthlyContactLimit: number;
  maximumFollowUps: number;
  maximumRetries: number;
  quietHours: { timezone: string; start: string; end: string };
  budgetMinor: number;
  currency: string;
  senderIdentity: { name: string; role: string; email: string; disclosure: string };
  humanMeetingOwner: string;
}

export async function getSalesDepartmentStatus(signal?: AbortSignal, range?: { from: string; to: string }) {
  const response = await api.get<{ data: SalesDepartmentStatus }>("/sales-department/status", { signal, params: range });
  return response.data.data;
}

export async function startSalesDepartment() {
  const response = await api.post<{ data: { status: string } }>("/sales-department/start", { confirm: true });
  return response.data.data;
}

export async function updateSalesDepartmentConfig(input: SalesDepartmentConfigInput) {
  const response = await api.put<{ data: { config: SalesDepartmentStatus["config"] } }>(
    "/sales-department/config",
    input,
  );
  return response.data.data.config;
}

export async function pauseSalesDepartment(reason: string) {
  const response = await api.post("/sales-department/pause", { confirm: true, reason });
  return response.data.data;
}
