import { useEffect, useState } from "react";
import { AlertCircle, BarChart3 } from "lucide-react";
import toast from "react-hot-toast";
import Layout from "../components/layout/Layout";
import { apiErrorMessage } from "../services/api";
import { getAnalytics, type AnalyticsData } from "../services/v2";

const metrics: Array<[keyof AnalyticsData, string]> = [["researchedLeads", "Research jobs"], ["verifiedLeads", "Verified leads"], ["approvedRecipients", "Recipients"], ["emailsQueued", "Queued"], ["emailsSent", "Sent"], ["delivered", "Delivered"], ["bounced", "Bounced"], ["replied", "Replies"], ["optedOut", "Opt-outs"], ["humanTakeoverRequired", "Human takeover"]];
export default function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  useEffect(() => { const controller = new AbortController(); void getAnalytics(controller.signal).then(setData).catch((error) => { if (!controller.signal.aborted) toast.error(apiErrorMessage(error, "Could not load analytics.")); }); return () => controller.abort(); }, []);
  return <Layout><div className="mx-auto max-w-7xl"><p className="text-sm font-semibold uppercase tracking-[.18em] text-cyan-300">Observed activity only</p><h1 className="mt-2 text-4xl font-bold">Analytics</h1><p className="mt-3 text-slate-400">Counts come from stored research, approval, delivery, reply, and suppression records.</p>{!data ? <div className="mt-8 h-40 animate-pulse rounded-2xl bg-slate-900" /> : <><div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{metrics.map(([key, label]) => <div key={key} className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><BarChart3 size={18} className="text-cyan-300" /><p className="mt-4 text-sm text-slate-400">{label}</p><p className="mt-1 text-3xl font-bold">{String(data[key])}</p></div>)}</div><div className="mt-6 grid gap-4 lg:grid-cols-2"><section className="rounded-2xl border border-slate-800 bg-slate-900 p-6"><h2 className="font-semibold">Response rate</h2><p className="mt-3 text-4xl font-bold">{(data.responseRate * 100).toFixed(1)}%</p><p className="mt-2 text-sm text-slate-500">Replies divided by recorded sent and delivered messages.</p></section><section className="rounded-2xl border border-amber-300/20 bg-amber-300/5 p-6"><h2 className="flex items-center gap-2 font-semibold text-amber-200"><AlertCircle size={18} /> Unavailable metrics</h2><ul className="mt-3 space-y-2 text-sm text-slate-400">{data.unavailableMetrics.map((item) => <li key={item}>• {item}</li>)}</ul></section></div></>}</div></Layout>;
}
