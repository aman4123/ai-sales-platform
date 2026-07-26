import { useEffect, useState } from "react";
import { ArrowRight, BarChart3, Mail, Search, UsersRound, WalletCards } from "lucide-react";
import { useNavigate } from "react-router";
import toast from "react-hot-toast";
import Layout from "../components/layout/Layout";
import { useAuth } from "../contexts/auth-context";
import { apiErrorMessage } from "../services/api";
import { getLeadPage } from "../services/leadStorage";
import { getReports } from "../services/reports";
import type { ReportData } from "../types/api";
import type { Lead } from "../types/lead";

const emptyReports: ReportData = {
  summary: { revenue: 0, leads: 0, meetings: 0, closedDeals: 0 },
  monthly: [],
  status: [],
};

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [recentLeads, setRecentLeads] = useState<Lead[]>([]);
  const [reports, setReports] = useState<ReportData>(emptyReports);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([getLeadPage({ limit: 5, signal: controller.signal }), getReports(controller.signal)])
      .then(([leadPage, reportData]) => {
        setRecentLeads(leadPage.leads);
        setReports(reportData);
      })
      .catch((error) => {
        if (!controller.signal.aborted) toast.error(apiErrorMessage(error, "Could not load the dashboard."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const interested = reports.status.find((entry) => entry.name === "Interested")?.value ?? 0;
  const metrics = [
    ["Total Leads", reports.summary.leads, UsersRound, "text-cyan-300"],
    ["Interested", interested, WalletCards, "text-emerald-300"],
    ["Meetings", reports.summary.meetings, BarChart3, "text-violet-300"],
    ["Revenue", currency.format(reports.summary.revenue), WalletCards, "text-amber-200"],
  ] as const;
  const quickActions = [
    ["Research a market", "Collect evidence before outreach.", Search, "/research"],
    ["Draft an email", "Generate an approval-ready message.", Mail, "/email"],
    ["Open CRM", "Review companies, contacts, and deals.", UsersRound, "/crm"],
    ["View analytics", "Inspect observed funnel activity.", BarChart3, "/analytics"],
  ] as const;

  return (
    <Layout>
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[.2em] text-cyan-300">Workspace overview</p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Welcome back, {user?.name?.split(" ")[0] ?? "there"}.
            </h1>
            <p className="mt-3 max-w-2xl text-slate-400">Move from verified evidence to human-approved outreach without losing context.</p>
          </div>
          <button type="button" onClick={() => navigate("/command")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-300 px-5 py-3 font-bold text-slate-950 hover:bg-cyan-200">
            Open Command Center <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-9 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {loading ? Array.from({ length: 4 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-2xl border border-white/10 bg-white/[.035]" />) : metrics.map(([label, value, Icon, color]) => (
            <article key={label} className="rounded-2xl border border-white/10 bg-white/[.035] p-5 shadow-lg shadow-black/10">
              <Icon size={19} className={color} aria-hidden="true" />
              <p className="mt-5 text-sm text-slate-400">{label}</p>
              <p className="mt-1 text-3xl font-bold tracking-tight text-white">{value}</p>
            </article>
          ))}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.05fr_.95fr]">
          <section className="rounded-2xl border border-white/10 bg-[#0a141e] p-6">
            <h2 className="text-xl font-bold text-white">Quick actions</h2>
            <p className="mt-2 text-sm text-slate-400">Continue with the next useful step.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {quickActions.map(([label, description, Icon, path]) => (
                <button key={label} type="button" onClick={() => navigate(path)} className="group rounded-xl border border-white/10 bg-white/[.025] p-4 text-left hover:border-cyan-300/25 hover:bg-cyan-300/[.04]">
                  <Icon size={19} className="text-cyan-300" aria-hidden="true" />
                  <span className="mt-4 block font-semibold text-white">{label}</span>
                  <span className="mt-1 block text-sm leading-5 text-slate-400 group-hover:text-slate-300">{description}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#0a141e] p-6">
            <div className="flex items-center justify-between gap-4">
              <div><h2 className="text-xl font-bold text-white">Recent leads</h2><p className="mt-2 text-sm text-slate-400">The newest records in your workspace.</p></div>
              <button type="button" onClick={() => navigate("/crm")} className="text-sm font-semibold text-cyan-300 hover:text-cyan-200">View CRM</button>
            </div>
            {loading ? <div className="mt-5 h-44 animate-pulse rounded-xl bg-white/[.035]" /> : recentLeads.length === 0 ? (
              <div className="mt-5 rounded-xl border border-dashed border-white/15 p-7 text-center"><p className="text-sm text-slate-400">No leads yet.</p><button type="button" onClick={() => navigate("/research")} className="mt-3 text-sm font-semibold text-cyan-300">Start with research</button></div>
            ) : (
              <div className="mt-5 space-y-3">
                {recentLeads.map((lead) => (
                  <article key={lead.id} className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[.025] p-4">
                    <div className="min-w-0"><h3 className="truncate font-semibold text-white">{lead.company}</h3><p className="mt-1 truncate text-sm text-slate-400">{lead.contact}</p></div>
                    <span className="shrink-0 rounded-full bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-200">{lead.status.replaceAll("_", " ")}</span>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </Layout>
  );
}
