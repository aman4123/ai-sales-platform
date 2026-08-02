import { useEffect, useState } from "react";
import { Activity, Building2, DatabaseZap, ListRestart, ServerCog, ShieldCheck, UserPlus, Users } from "lucide-react";
import { useNavigate } from "react-router";
import toast from "react-hot-toast";
import Layout from "../components/layout/Layout";
import { useAuth } from "../contexts/auth-context";
import { api, apiErrorMessage, setSupportContext } from "../services/api";
import {
  cancelAdminJob,
  createAdminUser,
  createSupportSession,
  getAdminJobs,
  getAdminOverview,
  getAdminSystem,
  getAdminTenants,
  getAdminUsers,
  retryAdminJob,
  revokeAdminUserSessions,
  updateAdminUser,
  updateTenantAiBudget,
  type AdminAutomationJob,
  type AdminOverview,
  type AdminSystemStatus,
  type AdminTenant,
  type AdminUser,
} from "../services/v2";

export default function Admin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [jobs, setJobs] = useState<AdminAutomationJob[]>([]);
  const [system, setSystem] = useState<AdminSystemStatus | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [working, setWorking] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteTenantId, setInviteTenantId] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const master = user?.accessMode === "MASTER_ADMIN";
    if (!master) {
      return () => controller.abort();
    }
    const requests = Promise.all([
          getAdminOverview(controller.signal),
          getAdminUsers(controller.signal),
          getAdminTenants(controller.signal),
          getAdminJobs(controller.signal),
          getAdminSystem(controller.signal),
        ] as const);
    void requests
      .then(([overview, adminUsers, adminTenants, adminJobs, systemStatus]) => {
        setData(overview);
        setUsers(adminUsers);
        setTenants(adminTenants);
        setJobs(adminJobs);
        setSystem(systemStatus);
      })
      .catch((error) => {
        if (!controller.signal.aborted) toast.error(apiErrorMessage(error, "Could not load the admin overview."));
      });
    return () => controller.abort();
  }, [user?.accessMode]);

  async function loadDemoData() {
    setSeeding(true);
    try {
      await api.post("/admin/demo-data");
      toast.success("Tester demo workspace is ready.");
      navigate("/crm");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not prepare tester demo data."));
    } finally {
      setSeeding(false);
    }
  }

  async function inviteUser() {
    if (!inviteName.trim() || !inviteEmail.trim()) return;
    setWorking(true);
    try {
      const result = await createAdminUser({
        name: inviteName,
        email: inviteEmail,
        ...(inviteTenantId ? { tenantId: inviteTenantId } : {}),
      });
      toast.success(
        result.invitationDelivered
          ? "Account created and verification invitation sent."
          : "Account created. Email delivery is unavailable; use the resend flow after configuration.",
      );
      setInviteName("");
      setInviteEmail("");
      setUsers(await getAdminUsers());
      setTenants(await getAdminTenants());
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not create the user."));
    } finally {
      setWorking(false);
    }
  }

  async function changeUserStatus(target: AdminUser) {
    const next = target.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    if (!window.confirm(`${next === "ACTIVE" ? "Reactivate" : "Suspend"} ${target.email}? Active sessions will be revoked when access is suspended.`)) return;
    setWorking(true);
    try {
      await updateAdminUser(target.id, { status: next });
      setUsers(await getAdminUsers());
      toast.success(`Account ${next === "ACTIVE" ? "reactivated" : "suspended"}.`);
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not update the account."));
    } finally {
      setWorking(false);
    }
  }

  async function revokeSessions(target: AdminUser) {
    if (!window.confirm(`Revoke every active session for ${target.email}?`)) return;
    setWorking(true);
    try {
      const revoked = await revokeAdminUserSessions(target.id, "Master Admin security action");
      toast.success(`${revoked} session(s) revoked.`);
      setUsers(await getAdminUsers());
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not revoke sessions."));
    } finally {
      setWorking(false);
    }
  }

  async function viewAsUser(target: AdminUser) {
    const membership = target.tenantMemberships[0];
    if (!membership) {
      toast.error("This user is not assigned to a company workspace.");
      return;
    }
    const reason = window.prompt("Enter the support reason. This read-only session will be audited.");
    if (!reason || reason.trim().length < 10) return;
    setWorking(true);
    try {
      const session = await createSupportSession({
        targetUserId: target.id,
        tenantId: membership.tenant.id,
        accessLevel: "READ_ONLY",
        reason: reason.trim(),
        durationMinutes: 15,
      });
      setSupportContext({
        sessionId: session.id,
        targetUserName: target.name,
        tenantName: membership.tenant.name,
        accessLevel: session.accessLevel,
        expiresAt: session.expiresAt,
      });
      window.location.assign("/dashboard");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not start read-only support mode."));
      setWorking(false);
    }
  }

  async function saveBudget(tenant: AdminTenant, mode: "DISABLED" | "LIMITED" | "INTERNAL_UNLIMITED", limit: number) {
    if (!window.confirm(`Apply ${mode.replaceAll("_", " ").toLowerCase()} AI access to ${tenant.name}?`)) return;
    setWorking(true);
    try {
      await updateTenantAiBudget(tenant.id, {
        mode,
        monthlyRequestLimit: mode === "LIMITED" ? limit : 0,
        warningThresholdPercent: 80,
        reason: "Master Admin reviewed tenant AI access",
      });
      setTenants(await getAdminTenants());
      toast.success("AI budget updated and audited.");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not update the AI budget."));
    } finally {
      setWorking(false);
    }
  }

  async function actOnJob(job: AdminAutomationJob, action: "retry" | "cancel") {
    const reason = window.prompt(`Reason to ${action} ${job.category.toLowerCase().replaceAll("_", " ")}?`);
    if (!reason || reason.trim().length < 5) return;
    setWorking(true);
    try {
      if (action === "retry") await retryAdminJob(job.id, reason.trim());
      else await cancelAdminJob(job.id, reason.trim());
      setJobs(await getAdminJobs());
      toast.success(`Job ${action === "retry" ? "queued for retry" : "cancelled"}.`);
    } catch (error) {
      toast.error(apiErrorMessage(error, `Could not ${action} the job.`));
    } finally {
      setWorking(false);
    }
  }

  const counters = data ? [
    ["Users", data.users],
    ["Active users", data.activeUsers],
    ["AI requests", data.aiRequests],
    ["Search requests", data.searchRequests],
    ["Email sends", data.emailSends],
    ["Failed jobs", data.failedJobs],
    ["Abuse flags", data.abuseFlags],
  ] : [];

  return (
    <Layout>
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[.2em] text-cyan-300">Role-protected operations</p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight text-white">{user?.accessMode === "TESTER" ? "Tester Mode" : "Owner Control Center"}</h1>
            <p className="mt-3 text-slate-400">System health and sanitized audit metadata. Message content is never exposed here.</p>
          </div>
          {user?.accessMode === "TESTER" && (
            <button type="button" disabled={seeding} onClick={() => void loadDemoData()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-300 px-5 py-3 font-bold text-slate-950 hover:bg-cyan-200 disabled:opacity-50">
              <DatabaseZap size={18} aria-hidden="true" /> {seeding ? "Preparing demo data…" : "Load demo workspace"}
            </button>
          )}
        </div>

        {user?.accessMode === "TESTER" ? (
          <section className="mt-8 rounded-2xl border border-amber-300/20 bg-amber-300/[.05] p-6">
            <h2 className="font-semibold text-amber-100">Isolated internal test workspace</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Any generated test fixtures are visibly labeled, remain in the TEST workspace, and never enter production metrics. Outbound delivery is still limited to the single configured test recipient.</p>
          </section>
        ) : !data ? <div className="mt-8 h-40 animate-pulse rounded-2xl border border-white/10 bg-white/[.035]" /> : (
          <>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {counters.map(([label, value]) => (
                <article key={String(label)} className="rounded-2xl border border-white/10 bg-white/[.035] p-5">
                  <Activity size={18} className="text-cyan-300" aria-hidden="true" />
                  <p className="mt-4 text-sm text-slate-400">{label}</p>
                  <p className="mt-1 text-3xl font-bold text-white">{value}</p>
                </article>
              ))}
            </div>
            <section className="mt-6 rounded-2xl border border-white/10 bg-[#0a141e] p-6">
              <h2 className="flex items-center gap-2 font-semibold text-white"><ShieldCheck size={18} className="text-emerald-300" /> Provider status</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <p className="rounded-xl border border-white/10 bg-white/[.025] p-4 text-sm">Search: {data.providerHealth.search.configured ? "Configured" : "Not configured"}</p>
                <p className="rounded-xl border border-white/10 bg-white/[.025] p-4 text-sm">AI: {data.providerHealth.ai.configured ? "Configured" : "Not configured"}</p>
                <p className="rounded-xl border border-white/10 bg-white/[.025] p-4 text-sm">Outbound: {data.providerHealth.email.outboundEnabled ? "Enabled" : "Disabled"}</p>
              </div>
            </section>
            {system && <section className="mt-6 rounded-2xl border border-white/10 bg-[#0a141e] p-6">
              <h2 className="flex items-center gap-2 font-semibold text-white"><ServerCog size={18} className="text-cyan-300" /> System and deployment</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {[["Database", system.database], ["Redis", system.redis], ["Web service", system.webService], ["Worker", system.worker], ["Revision", system.deploymentVersion.slice(0, 12)]].map(([label, value]) => <div key={label} className="rounded-xl border border-white/10 bg-white/[.025] p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 break-all text-sm font-semibold text-slate-200">{value}</p></div>)}
              </div>
            </section>}
            <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[#0a141e]">
              <div className="border-b border-white/10 p-5"><h2 className="flex items-center gap-2 font-semibold text-white"><ListRestart size={18} className="text-cyan-300" /> Bounded automation jobs</h2><p className="mt-2 text-sm text-slate-500">Payload contents are not exposed in the owner overview.</p></div>
              <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="text-slate-500"><tr><th className="p-4">Created</th><th className="p-4">Category</th><th className="p-4">Status</th><th className="p-4">Attempts</th><th className="p-4">Failure</th><th className="p-4">Action</th></tr></thead><tbody>{jobs.length === 0 ? <tr><td colSpan={6} className="p-6 text-center text-slate-500">No automation jobs recorded.</td></tr> : jobs.map((job) => <tr key={job.id} className="border-t border-white/10"><td className="p-4 text-slate-400">{new Date(job.createdAt).toLocaleString()}</td><td className="p-4 text-slate-300">{job.category.replaceAll("_", " ")}</td><td className="p-4 text-slate-400">{job.status}</td><td className="p-4 text-slate-400">{job.attemptCount}/{job.maxAttempts}</td><td className="p-4 text-rose-200">{job.errorCode ?? "—"}</td><td className="p-4"><div className="flex gap-2">{["FAILED", "BLOCKED", "CANCELLED"].includes(job.status) && <button type="button" disabled={working} onClick={() => void actOnJob(job, "retry")} className="rounded-lg border border-cyan-300/30 px-3 py-2 text-xs font-semibold text-cyan-200 disabled:opacity-40">Retry</button>}{["PENDING", "RETRY_SCHEDULED"].includes(job.status) && <button type="button" disabled={working} onClick={() => void actOnJob(job, "cancel")} className="rounded-lg border border-rose-300/30 px-3 py-2 text-xs font-semibold text-rose-200 disabled:opacity-40">Cancel</button>}</div></td></tr>)}</tbody></table></div>
            </section>
            <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[#0a141e]">
              <div className="border-b border-white/10 p-5"><h2 className="font-semibold text-white">Recent audit activity</h2></div>
              <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="text-slate-500"><tr><th className="p-4">Time</th><th className="p-4">Action</th><th className="p-4">Resource</th><th className="p-4">Request</th></tr></thead><tbody>{data.auditLogs.map((log) => <tr key={log.id} className="border-t border-white/10"><td className="p-4 text-slate-400">{new Date(log.createdAt).toLocaleString()}</td><td className="p-4">{log.action}</td><td className="p-4 text-slate-400">{log.resourceType}</td><td className="p-4 font-mono text-xs text-slate-500">{log.requestId || "—"}</td></tr>)}</tbody></table></div>
            </section>
            {user?.accessMode === "MASTER_ADMIN" && (
              <>
                <section className="mt-6 rounded-2xl border border-white/10 bg-[#0a141e] p-6">
                  <h2 className="flex items-center gap-2 text-lg font-semibold text-white"><UserPlus size={19} className="text-cyan-300" /> Create or invite user</h2>
                  <p className="mt-2 text-sm text-slate-400">No password is exposed. The account must complete the normal verified-email setup flow.</p>
                  <div className="mt-5 grid gap-3 md:grid-cols-4">
                    <label className="text-sm text-slate-300">Name<input value={inviteName} onChange={(event) => setInviteName(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3" /></label>
                    <label className="text-sm text-slate-300">Email<input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3" /></label>
                    <label className="text-sm text-slate-300">Company workspace<select value={inviteTenantId} onChange={(event) => setInviteTenantId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3"><option value="">Create personal workspace</option>{tenants.filter((tenant) => tenant.status === "ACTIVE").map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</select></label>
                    <button type="button" disabled={working || !inviteName.trim() || !inviteEmail.trim()} onClick={() => void inviteUser()} className="self-end rounded-xl bg-cyan-300 px-4 py-3 font-bold text-slate-950 disabled:opacity-40">Create account</button>
                  </div>
                </section>

                <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[#0a141e]">
                  <div className="border-b border-white/10 p-5"><h2 className="flex items-center gap-2 font-semibold text-white"><Users size={18} className="text-cyan-300" /> Users and sessions</h2></div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-left text-sm">
                      <thead className="text-slate-500"><tr><th className="p-4">User</th><th className="p-4">Workspace role</th><th className="p-4">Status</th><th className="p-4">Last login</th><th className="p-4">Usage</th><th className="p-4">Actions</th></tr></thead>
                      <tbody>{users.map((target) => <tr key={target.id} className="border-t border-white/10"><td className="p-4"><p className="font-medium text-white">{target.name}</p><p className="mt-1 text-xs text-slate-500">{target.email}</p></td><td className="p-4 text-slate-400">{target.tenantMemberships[0]?.tenant.name ?? "Unassigned"} · {target.tenantMemberships[0]?.role ?? "—"}</td><td className="p-4"><span className={target.status === "ACTIVE" ? "text-emerald-300" : "text-amber-200"}>{target.status}</span>{!target.emailVerifiedAt && <p className="mt-1 text-xs text-slate-500">Unverified</p>}</td><td className="p-4 text-slate-400">{target.lastLoginAt ? new Date(target.lastLoginAt).toLocaleString() : "Never"}</td><td className="p-4 text-slate-400">{target._count.aiRequests} AI · {target._count.campaigns} campaigns</td><td className="p-4"><div className="flex flex-wrap gap-2"><button type="button" disabled={working || target.id === user.id} onClick={() => void viewAsUser(target)} className="rounded-lg border border-violet-300/30 px-3 py-2 text-xs font-semibold text-violet-200 disabled:opacity-40">View as user</button><button type="button" disabled={working || target.id === user.id} onClick={() => void changeUserStatus(target)} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold disabled:opacity-40">{target.status === "ACTIVE" ? "Suspend" : "Reactivate"}</button><button type="button" disabled={working || target.id === user.id} onClick={() => void revokeSessions(target)} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold disabled:opacity-40">Revoke sessions</button></div></td></tr>)}</tbody>
                    </table>
                  </div>
                </section>

                <section className="mt-6 rounded-2xl border border-white/10 bg-[#0a141e] p-6">
                  <h2 className="flex items-center gap-2 text-lg font-semibold text-white"><Building2 size={19} className="text-cyan-300" /> Companies, plans, and AI budgets</h2>
                  <p className="mt-2 text-sm text-slate-400">Customer AI follows a bounded plan allowance and can be tightened or disabled here. Internal unlimited access is reserved for audited platform testing.</p>
                  <div className="mt-5 space-y-3">
                    {tenants.map((tenant) => (
                      <TenantBudgetControls key={tenant.id} tenant={tenant} working={working} onSave={saveBudget} />
                    ))}
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}

function TenantBudgetControls({
  tenant,
  working,
  onSave,
}: {
  tenant: AdminTenant;
  working: boolean;
  onSave: (
    tenant: AdminTenant,
    mode: "DISABLED" | "LIMITED" | "INTERNAL_UNLIMITED",
    limit: number,
  ) => Promise<void>;
}) {
  const [mode, setMode] = useState<"DISABLED" | "LIMITED" | "INTERNAL_UNLIMITED">(
    tenant.aiBudget?.mode ?? "DISABLED",
  );
  const [limit, setLimit] = useState(tenant.aiBudget?.monthlyRequestLimit || 25);
  return (
    <div className="grid gap-3 rounded-xl border border-white/10 bg-white/[.025] p-4 lg:grid-cols-[1fr_auto_auto_auto] lg:items-end">
      <div>
        <p className="font-semibold text-white">{tenant.name}</p>
        <p className="mt-1 text-xs text-slate-500">
          {tenant.subscription?.plan.name ?? "No plan"} · {tenant._count.memberships} user(s) · {tenant.status}
        </p>
      </div>
      <label className="text-xs text-slate-400">
        AI mode
        <select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)} className="mt-1 block rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">
          <option value="DISABLED">Disabled</option>
          <option value="LIMITED">Limited</option>
          <option value="INTERNAL_UNLIMITED">Internal unlimited</option>
        </select>
      </label>
      <label className="text-xs text-slate-400">
        Monthly requests
        <input type="number" min={1} max={1_000_000} disabled={mode !== "LIMITED"} value={limit} onChange={(event) => setLimit(Number(event.target.value))} className="mt-1 block w-36 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white disabled:opacity-40" />
      </label>
      <button type="button" disabled={working || (mode === "LIMITED" && limit < 1)} onClick={() => void onSave(tenant, mode, limit)} className="rounded-lg border border-cyan-300/40 px-4 py-2 text-sm font-semibold text-cyan-200 disabled:opacity-40">
        Save budget
      </button>
    </div>
  );
}
