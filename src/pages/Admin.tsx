import { useEffect, useState } from "react";
import { Activity, DatabaseZap, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router";
import toast from "react-hot-toast";
import Layout from "../components/layout/Layout";
import { useAuth } from "../contexts/auth-context";
import { api, apiErrorMessage } from "../services/api";
import { getAdminOverview, type AdminOverview } from "../services/v2";

export default function Admin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<AdminOverview | null>(null);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void getAdminOverview(controller.signal)
      .then(setData)
      .catch((error) => {
        if (!controller.signal.aborted) toast.error(apiErrorMessage(error, "Could not load the admin overview."));
      });
    return () => controller.abort();
  }, []);

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
            <h1 className="mt-2 text-4xl font-bold tracking-tight text-white">Admin</h1>
            <p className="mt-3 text-slate-400">System health and sanitized audit metadata. Message content is never exposed here.</p>
          </div>
          {user?.accessMode === "TESTER" && (
            <button type="button" disabled={seeding} onClick={() => void loadDemoData()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-300 px-5 py-3 font-bold text-slate-950 hover:bg-cyan-200 disabled:opacity-50">
              <DatabaseZap size={18} aria-hidden="true" /> {seeding ? "Preparing demo data…" : "Load demo workspace"}
            </button>
          )}
        </div>

        {!data ? <div className="mt-8 h-40 animate-pulse rounded-2xl border border-white/10 bg-white/[.035]" /> : (
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
            <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[#0a141e]">
              <div className="border-b border-white/10 p-5"><h2 className="font-semibold text-white">Recent audit activity</h2></div>
              <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="text-slate-500"><tr><th className="p-4">Time</th><th className="p-4">Action</th><th className="p-4">Resource</th><th className="p-4">Request</th></tr></thead><tbody>{data.auditLogs.map((log) => <tr key={log.id} className="border-t border-white/10"><td className="p-4 text-slate-400">{new Date(log.createdAt).toLocaleString()}</td><td className="p-4">{log.action}</td><td className="p-4 text-slate-400">{log.resourceType}</td><td className="p-4 font-mono text-xs text-slate-500">{log.requestId || "—"}</td></tr>)}</tbody></table></div>
            </section>
          </>
        )}
      </div>
    </Layout>
  );
}
