import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  CirclePause,
  Clock3,
  Mail,
  Search,
  Sparkles,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { useNavigate } from "react-router";
import toast from "react-hot-toast";
import Layout from "../components/layout/Layout";
import { useAuth } from "../contexts/auth-context";
import { apiErrorMessage } from "../services/api";
import {
  getDailySalesBrief,
  getSalesDepartmentStatus,
  pauseSalesDepartment,
  startSalesDepartment,
  type DailySalesBrief,
  type SalesDepartmentStatus,
} from "../services/v2";

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function rangeFor(days: number) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  return { from: from.toISOString(), to: to.toISOString() };
}

function loadDashboard(days: number, signal?: AbortSignal) {
  return Promise.all([
    getSalesDepartmentStatus(signal, rangeFor(days)),
    getDailySalesBrief(signal),
  ] as const);
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [status, setStatus] = useState<SalesDepartmentStatus | null>(null);
  const [brief, setBrief] = useState<DailySalesBrief | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  async function refresh() {
    const [department, dailyBrief] = await loadDashboard(days);
    setStatus(department);
    setBrief(dailyBrief);
  }

  useEffect(() => {
    const controller = new AbortController();
    void loadDashboard(days, controller.signal)
      .then(([department, dailyBrief]) => {
        setStatus(department);
        setBrief(dailyBrief);
      })
      .catch((error) => {
        if (!controller.signal.aborted) toast.error(apiErrorMessage(error, "Could not load the AI Sales Department."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [days]);

  function blockerPath(code: string | undefined) {
    if (code === "SALES_STRATEGY_REQUIRED") return "/command";
    if (code === "RESEARCH_PROVIDER_REQUIRED" || code === "OUTBOUND_PROVIDER_REQUIRED") return "/settings";
    return "/company-setup";
  }

  async function primaryAction() {
    if (!status) return;
    if (!status.canStart) {
      navigate(blockerPath(status.currentBlocker?.code));
      return;
    }
    setWorking(true);
    try {
      await startSalesDepartment();
      toast.success("AI Sales started. Bounded background jobs are now queued.");
      await refresh();
    } catch (error) {
      toast.error(apiErrorMessage(error, "AI Sales could not start."));
    } finally {
      setWorking(false);
    }
  }

  async function pause() {
    if (!window.confirm("Pause AI Sales and cancel pending background work?")) return;
    setWorking(true);
    try {
      await pauseSalesDepartment("Paused by a human operator from the command center.");
      toast.success("AI Sales paused. Pending jobs were cancelled safely.");
      await refresh();
    } catch (error) {
      toast.error(apiErrorMessage(error, "AI Sales could not be paused."));
    } finally {
      setWorking(false);
    }
  }

  const metrics = status ? [
    ["Leads discovered", status.metrics.leadsDiscovered],
    ["Leads verified", status.metrics.leadsVerified],
    ["Qualified prospects", status.metrics.qualifiedProspects],
    ["Awaiting approval", status.metrics.outreachAwaitingApproval],
    ["Outreach sent", status.metrics.outreachSent],
    ["Delivered", status.metrics.deliveriesConfirmed],
    ["Replies", status.metrics.replies],
    ["Interested", status.metrics.interestedProspects],
    ["Meetings", status.metrics.meetings],
    ["Opportunities", status.metrics.opportunities],
    ["Won customers", status.metrics.wonCustomers],
    ["Revenue", formatCurrency(status.metrics.revenue, status.metrics.revenueCurrency)],
  ] : [];

  return (
    <Layout>
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[.2em] text-cyan-300">Hire and manage your AI Sales Department</p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight text-white sm:text-5xl">Welcome back, {user?.name?.split(" ")[0] ?? "there"}.</h1>
            <p className="mt-3 max-w-3xl text-slate-400">See exactly what the AI workforce is doing, what it completed, what is blocked, and where a human decision is required.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            {status?.config.status === "RUNNING" && <button type="button" disabled={working} onClick={() => void pause()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300/40 px-5 py-3 font-bold text-amber-100 disabled:opacity-50"><CirclePause size={18} /> Pause AI Sales</button>}
            <button type="button" disabled={working || loading} onClick={() => void primaryAction()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-300 px-5 py-3 font-bold text-slate-950 hover:bg-cyan-200 disabled:opacity-50">Start AI Sales <ArrowRight size={18} /></button>
          </div>
        </div>

        {loading || !status ? <div className="mt-9 h-72 animate-pulse rounded-2xl border border-white/10 bg-white/[.035]" /> : (
          <>
            <section className="mt-9 rounded-2xl border border-white/10 bg-[#0a141e] p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                  <span className={`h-3 w-3 rounded-full ${status.config.status === "RUNNING" ? "bg-emerald-300" : status.config.status === "BLOCKED" ? "bg-rose-300" : "bg-amber-200"}`} />
                  <div><h2 className="text-xl font-bold text-white">{status.workspace.name}</h2><p className="mt-1 text-sm text-slate-400">{status.workspace.dataLabel} data · {status.config.mode} mode · {status.config.status}</p></div>
                </div>
                <label className="text-sm text-slate-400">Date range<select value={days} onChange={(event) => { setLoading(true); setDays(Number(event.target.value)); }} className="ml-3 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></label>
              </div>
              <div className="mt-5 grid gap-4 lg:grid-cols-3">
                <StatusCard icon={status.currentBlocker ? AlertTriangle : CheckCircle2} title="Current blocker" value={status.currentBlocker?.message ?? "No blocking configuration issue is recorded."} tone={status.currentBlocker ? "amber" : "emerald"} />
                <StatusCard icon={UsersRound} title="Human actions required" value={`${status.metrics.humanActions} open task${status.metrics.humanActions === 1 ? "" : "s"}`} tone="cyan" />
                <StatusCard icon={ArrowRight} title="Recommended next action" value={status.recommendedNextAction} tone="violet" />
              </div>
              {status.blockers.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{status.blockers.map((blocker) => <button key={blocker.code} type="button" onClick={() => navigate(blockerPath(blocker.code))} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${blocker.blocking ? "border-rose-300/30 text-rose-200" : "border-amber-300/30 text-amber-100"}`}>{blocker.message}</button>)}</div>}
            </section>

            <section className="mt-6">
              <div className="flex items-end justify-between gap-4"><div><h2 className="text-xl font-bold text-white">Recorded results</h2><p className="mt-1 text-sm text-slate-400">Observed {status.workspace.dataLabel.toLowerCase()} records in the selected date range. Zero means zero.</p></div></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">{metrics.map(([label, value]) => <div key={String(label)} className="rounded-xl border border-white/10 bg-white/[.025] p-4"><p className="text-xs text-slate-400">{label}</p><p className="mt-2 text-2xl font-bold text-white">{value}</p></div>)}</div>
            </section>

            <section className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_.7fr]">
              <div className="rounded-2xl border border-white/10 bg-[#0a141e] p-6">
                <div><h2 className="flex items-center gap-2 text-xl font-bold text-white"><Bot size={20} className="text-cyan-300" /> AI employees</h2><p className="mt-2 text-sm text-slate-400">UI identities backed by one centrally controlled orchestration and permission system.</p></div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">{status.employees.map((employee) => <article key={employee.key} className="rounded-xl border border-white/10 bg-white/[.025] p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-white">{employee.name} · {employee.role}</h3><p className="mt-1 text-sm leading-5 text-slate-400">{employee.job}</p></div><span className="rounded-full bg-white/5 px-2 py-1 text-[11px] font-semibold text-cyan-200">{employee.status}</span></div><p className="mt-3 text-xs text-slate-400">Current task: {employee.currentTask?.toLowerCase() ?? "none"}</p>{employee.errorState && <p className="mt-1 text-xs text-rose-300">Error: {employee.errorState}</p>}<p className="mt-1 text-xs text-slate-400">KPI: {employee.kpi}</p></article>)}</div>
              </div>
              <div className="space-y-6">
                <div className="rounded-2xl border border-white/10 bg-[#0a141e] p-6"><h2 className="text-lg font-bold text-white">Provider and usage truth</h2><div className="mt-4 space-y-3 text-sm"><TruthRow icon={Search} label="Research" value={status.providers.research.configured ? `${status.providers.research.provider} configured` : "Not configured"} /><TruthRow icon={Sparkles} label="AI" value={status.providers.ai.configured ? `${status.providers.ai.selected} · ${status.providers.ai.model}` : "Not configured"} /><TruthRow icon={Mail} label="Email" value={`${status.providers.email.mode} · ${status.providers.email.enabled ? "enabled" : "disabled"}`} /><TruthRow icon={Clock3} label="Usage" value={`${status.metrics.aiRequests} AI · ${status.metrics.searchRequests} search requests recorded`} /><TruthRow icon={WalletCards} label="Costs" value={status.metrics.externalProviderCostsAvailable ? "Provider costs recorded" : "External provider costs unavailable"} /></div></div>
                <div className="rounded-2xl border border-white/10 bg-[#0a141e] p-6"><h2 className="text-lg font-bold text-white">Recent bounded jobs</h2><div className="mt-4 space-y-3">{status.recentJobs.length === 0 ? <p className="text-sm text-slate-400">No jobs have run in this workspace.</p> : status.recentJobs.slice(0, 8).map((job) => <div key={job.id} className="flex items-center justify-between gap-3 border-b border-white/5 pb-3 text-sm"><span className="text-slate-300">{job.category.replaceAll("_", " ").toLowerCase()}</span><span className={job.status === "FAILED" ? "text-rose-300" : "text-slate-400"}>{job.status}</span></div>)}</div></div>
              </div>
            </section>
          </>
        )}

        {brief && <section className="mt-6 rounded-2xl border border-white/10 bg-[#0a141e] p-6"><h2 className="flex items-center gap-2 text-xl font-bold text-white"><Sparkles size={20} className="text-cyan-300" /> Daily sales brief</h2><p className="mt-2 text-sm text-slate-400">Persisted {brief.dataLabel.toLowerCase()} operational facts · generated {new Date(brief.generatedAt).toLocaleString()}</p><div className="mt-5 grid gap-4 lg:grid-cols-3"><BriefList title="Recommended actions" items={brief.priorities} empty="No priority was generated." /><BriefList title="Approvals required" items={brief.approvals} empty="No approvals are waiting." /><BriefList title="Failures and risks" items={[...brief.failures, ...brief.risks]} empty="No recorded failure or risk." /></div></section>}
      </div>
    </Layout>
  );
}

function StatusCard({ icon: Icon, title, value, tone }: { icon: typeof AlertTriangle; title: string; value: string; tone: "amber" | "emerald" | "cyan" | "violet" }) {
  const color = { amber: "text-amber-200", emerald: "text-emerald-300", cyan: "text-cyan-300", violet: "text-violet-300" }[tone];
  return <article className="rounded-xl border border-white/10 bg-white/[.025] p-4"><Icon size={18} className={color} /><p className="mt-3 text-xs uppercase tracking-wide text-slate-400">{title}</p><p className="mt-2 text-sm leading-6 text-slate-200">{value}</p></article>;
}

function TruthRow({ icon: Icon, label, value }: { icon: typeof Search; label: string; value: string }) {
  return <div className="flex gap-3"><Icon size={17} className="mt-0.5 shrink-0 text-cyan-300" /><div><p className="text-slate-300">{label}</p><p className="mt-0.5 text-xs text-slate-400">{value}</p></div></div>;
}

function BriefList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return <div className="rounded-xl border border-white/10 bg-white/[.025] p-4"><h3 className="font-semibold text-white">{title}</h3><ul className="mt-3 space-y-2 text-sm text-slate-400">{(items.length > 0 ? items : [empty]).map((item) => <li key={item}>{item}</li>)}</ul></div>;
}
