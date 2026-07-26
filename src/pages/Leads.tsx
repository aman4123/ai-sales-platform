import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Search, ShieldQuestion } from "lucide-react";
import toast from "react-hot-toast";
import Layout from "../components/layout/Layout";
import { apiErrorMessage } from "../services/api";
import { getLeadPage } from "../services/leadStorage";
import type { Lead } from "../types/lead";

export default function Leads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      void getLeadPage({ search: query.trim() || undefined, limit: 100, signal: controller.signal })
        .then((page) => setLeads(page.leads))
        .catch((error) => {
          if (!controller.signal.aborted) toast.error(apiErrorMessage(error, "Could not load leads."));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return (
    <Layout>
      <div className="mx-auto max-w-7xl">
        <p className="text-sm font-semibold uppercase tracking-[.18em] text-cyan-300">Explainable qualification</p>
        <h1 className="mt-2 text-4xl font-bold">Leads</h1>
        <p className="mt-3 max-w-3xl text-slate-400">Review fit, evidence quality, confidence, and risk before adding anyone to outreach.</p>

        <label className="relative mt-8 block max-w-xl">
          <span className="sr-only">Search leads</span>
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search company, contact, email, or industry" className="w-full rounded-xl border border-slate-800 bg-slate-900 py-3 pl-11 pr-4" />
        </label>

        {loading ? <div className="mt-8 h-40 animate-pulse rounded-2xl bg-slate-900" aria-label="Loading leads" /> : leads.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-slate-700 p-12 text-center text-slate-400"><ShieldQuestion className="mx-auto mb-3" /><p>No matching leads. Save verified research or add a user-provided CRM lead.</p></div>
        ) : (
          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            {leads.map((lead) => {
              const confidence = lead.confidence ?? 0;
              const scored = lead.score != null;
              return <article key={lead.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold">{lead.company}</h2><p className="mt-1 text-sm text-slate-400">{lead.contact}{lead.industry ? ` · ${lead.industry}` : ""}</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${scored ? "bg-cyan-300/10 text-cyan-200" : "bg-amber-300/10 text-amber-200"}`}>{scored ? `Score ${lead.score}` : "Requires confirmation"}</span></div>
                <div className="mt-5 grid grid-cols-2 gap-3 text-sm"><div className="rounded-xl bg-slate-950 p-3"><p className="text-slate-500">Confidence</p><p className="mt-1 font-semibold">{confidence > 0 ? `${Math.round(confidence * 100)}%` : "Not verified"}</p></div><div className="rounded-xl bg-slate-950 p-3"><p className="text-slate-500">Evidence quality</p><p className="mt-1 font-semibold">{lead.evidenceQuality != null ? `${Math.round(lead.evidenceQuality * 100)}%` : "Not verified"}</p></div></div>
                <div className="mt-4 flex items-start gap-2 text-sm text-slate-400">{confidence > 0 ? <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-400" size={17} /> : <AlertTriangle className="mt-0.5 shrink-0 text-amber-300" size={17} />}<span>{lead.scoreReasons?.length ? lead.scoreReasons.join(" · ") : "No explainable scoring record is attached yet."}</span></div>
                {!!lead.riskFlags?.length && <p className="mt-3 text-xs text-rose-300">Risk flags: {lead.riskFlags.join(", ")}</p>}
              </article>;
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
