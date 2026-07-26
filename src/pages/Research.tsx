import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  CircleHelp,
  Database,
  MailPlus,
  Search,
  ShieldAlert,
  UserRoundSearch,
} from "lucide-react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router";
import Layout from "../components/layout/Layout";
import Loader from "../components/ui/Loader";
import { apiErrorMessage } from "../services/api";
import {
  createResearchJob,
  getResearchStatus,
  saveResearchCompany,
  type CompanyResearchResult,
  type ResearchJob,
  type ResearchStatus,
} from "../services/v2";

function statusBadge(status: string) {
  const verified = status === "VERIFIED";
  return verified
    ? "bg-emerald-400/10 text-emerald-300"
    : "bg-amber-300/10 text-amber-200";
}

function ResultCard({ result }: { result: CompanyResearchResult }) {
  const navigate = useNavigate();
  const facts = useMemo(
    () => result.evidence.filter((item) => ["VERIFIED", "PARTIALLY_VERIFIED"].includes(item.verificationStatus)),
    [result.evidence],
  );
  const analysis = result.salesAnalysis?.statements ?? [];

  async function save() {
    try {
      const saved = await saveResearchCompany(result.id);
      toast.success(saved.duplicate ? "Existing CRM company linked." : "Company saved to CRM.");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not save this company."));
    }
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
      <header className="flex flex-col gap-5 border-b border-slate-800 p-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-cyan-300"><Building2 size={17} /> Candidate company record</div>
          <h2 className="mt-2 text-2xl font-bold">{result.companyName ?? "Not verified"}</h2>
          <p className="mt-2 text-sm text-slate-400">{result.domain ?? "Domain not verified"}</p>
        </div>
        <div className="rounded-xl bg-slate-800 px-4 py-3 text-right">
          <p className="text-xs uppercase tracking-wider text-slate-400">Evidence confidence</p>
          <p className="mt-1 text-2xl font-bold text-cyan-300">{result.confidenceScore}%</p>
        </div>
      </header>

      <div className="grid gap-px bg-slate-800 lg:grid-cols-2">
        <section className="bg-slate-900 p-6" aria-labelledby={`verified-${result.id}`}>
          <h3 id={`verified-${result.id}`} className="flex items-center gap-2 font-semibold"><CheckCircle2 className="text-emerald-300" size={19} /> Verified facts</h3>
          {facts.length ? (
            <ul className="mt-5 space-y-4" aria-label="Evidence-backed facts">
              {facts.map((fact) => (
                <li key={fact.id} className="rounded-xl bg-slate-800/70 p-4">
                  <div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{fact.field.replace(/([A-Z])/g, " $1")}</span><span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${statusBadge(fact.verificationStatus)}`}>{fact.verificationStatus.replaceAll("_", " ")}</span></div>
                  <p className="mt-2 break-words text-sm text-slate-200">{fact.value}</p>
                </li>
              ))}
            </ul>
          ) : <p className="mt-4 text-sm text-slate-400">No verified facts are available.</p>}
        </section>

        <section className="bg-slate-900 p-6" aria-labelledby={`unknown-${result.id}`}>
          <h3 id={`unknown-${result.id}`} className="flex items-center gap-2 font-semibold"><CircleHelp className="text-amber-200" size={19} /> Unknown / not verified</h3>
          <div className="mt-5 flex flex-wrap gap-2">
            {result.unknownFields.length ? result.unknownFields.map((field) => (
              <span key={field} className="rounded-full border border-amber-300/20 bg-amber-300/5 px-3 py-1.5 text-xs text-amber-100">{field.replace(/([A-Z])/g, " $1")} · Not verified</span>
            )) : <p className="text-sm text-slate-400">No fields are marked unknown.</p>}
          </div>
          <div className="mt-7">
            <h4 className="flex items-center gap-2 text-sm font-semibold"><UserRoundSearch size={17} /> Public contact information</h4>
            <p className="mt-3 text-sm text-slate-400">{result.publicEmail ?? "Email: Not verified"}</p>
            <p className="mt-1 text-sm text-slate-400">{result.publicPhone ?? "Phone: Not verified"}</p>
          </div>
          <div className="mt-7">
            <h4 className="text-sm font-semibold">Decision-maker</h4>
            <p className="mt-3 text-sm text-slate-400">Not verified. Public professional evidence is required before a person can be added.</p>
          </div>
        </section>
      </div>

      {result.riskFlags.length > 0 && (
        <section className="border-t border-slate-800 bg-amber-300/[.04] p-6">
          <h3 className="flex items-center gap-2 font-semibold text-amber-100"><ShieldAlert size={19} /> Review warnings</h3>
          <ul className="mt-3 space-y-2 text-sm text-amber-100/80">{result.riskFlags.map((flag) => <li key={flag}>• {flag.replaceAll("_", " ")}</li>)}</ul>
        </section>
      )}

      <section className="border-t border-slate-800 p-6" aria-labelledby={`evidence-${result.id}`}>
        <h3 id={`evidence-${result.id}`} className="flex items-center gap-2 font-semibold"><Database className="text-cyan-300" size={19} /> Evidence</h3>
        <div className="mt-4 space-y-3">
          {result.evidence.map((item) => (
            <details key={item.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <summary className="cursor-pointer text-sm font-medium">{item.sourceTitle}</summary>
              <div className="mt-3 text-sm text-slate-400">
                <p>Field: {item.field} · Source: {item.sourceType.replaceAll("_", " ")}</p>
                <p className="mt-1">Retrieved {new Date(item.retrievedAt).toLocaleString()}</p>
                <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200">Open source <ArrowUpRight size={14} /></a>
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="border-t border-slate-800 p-6">
        <h3 className="font-semibold">AI sales opportunity analysis</h3>
        {analysis.length ? <ul className="mt-4 space-y-3">{analysis.map((item) => <li key={`${item.statement}-${item.evidenceIds.join()}`} className="rounded-xl bg-cyan-300/5 p-4 text-sm leading-6 text-slate-300"><span className="mr-2 rounded bg-cyan-300/10 px-2 py-1 text-[11px] font-bold text-cyan-300">AI INFERENCE</span>{item.statement}</li>)}</ul> : <p className="mt-3 text-sm text-slate-400">No grounded opportunity analysis is available. Requires confirmation.</p>}
      </section>

      <footer className="flex flex-wrap gap-3 border-t border-slate-800 p-6">
        <button type="button" onClick={() => void save()} className="rounded-xl bg-cyan-300 px-4 py-2.5 font-semibold text-slate-950 hover:bg-cyan-200">Save to CRM</button>
        <button type="button" onClick={() => navigate("/campaigns")} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 font-semibold hover:bg-slate-800"><MailPlus size={17} /> Generate email</button>
        <button type="button" onClick={() => navigate("/campaigns")} className="rounded-xl border border-slate-700 px-4 py-2.5 font-semibold hover:bg-slate-800">Add to campaign</button>
      </footer>
    </article>
  );
}

export default function Research() {
  const [status, setStatus] = useState<ResearchStatus | null>(null);
  const [query, setQuery] = useState("");
  const [targetType, setTargetType] = useState<"COMPANY" | "MARKET" | "CONTACT">("COMPANY");
  const [confirmed, setConfirmed] = useState(false);
  const [job, setJob] = useState<ResearchJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void getResearchStatus(controller.signal)
      .then(setStatus)
      .catch((reason) => {
        if (!controller.signal.aborted) setError(apiErrorMessage(reason, "Could not load research status."));
      });
    return () => controller.abort();
  }, []);

  async function research() {
    if (!query.trim() || !confirmed || !status?.configured) return;
    setLoading(true);
    setError(null);
    try {
      const result = await createResearchJob({ query, targetType });
      setJob(result.job);
      toast.success(result.cached ? "Loaded verified cached sources." : "Verified research completed.");
    } catch (reason) {
      setError(apiErrorMessage(reason, "Verified research could not be completed."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-sm font-semibold uppercase tracking-[.18em] text-cyan-300">Evidence workspace</p><h1 className="mt-2 text-4xl font-bold">Research</h1><p className="mt-3 max-w-2xl text-slate-400">Search configured public sources, retain field-level evidence, and keep unknown facts visibly unknown.</p></div>
          {status && <span className={`self-start rounded-full px-3 py-1.5 text-xs font-semibold ${status.configured ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-300/10 text-amber-200"}`}>{status.configured ? `${status.provider} configured` : "Live search disabled"}</span>}
        </div>

        {status && !status.configured && (
          <div className="mt-8 flex gap-3 rounded-2xl border border-amber-300/20 bg-amber-300/5 p-5 text-amber-100"><AlertTriangle className="mt-0.5 shrink-0" size={20} /><div><p className="font-semibold">Verified research unavailable</p><p className="mt-1 text-sm text-amber-100/75">{status.message}</p></div></div>
        )}

        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6" aria-labelledby="research-goal">
          <h2 id="research-goal" className="font-semibold">A. Research goal</h2>
          <label htmlFor="research-query" className="mt-5 block text-sm text-slate-300">What market or company should be researched?</label>
          <textarea id="research-query" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={500} rows={4} placeholder="Describe the target industry, geography, and qualification goal." className="mt-2 w-full resize-y rounded-xl border border-slate-700 bg-slate-950 p-4 text-white placeholder:text-slate-600" />
          <div className="mt-4 grid gap-4 sm:grid-cols-[220px_1fr] sm:items-end">
            <div><label htmlFor="research-target" className="block text-sm text-slate-300">B. Target type</label><select id="research-target" value={targetType} onChange={(event) => setTargetType(event.target.value as typeof targetType)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3"><option value="COMPANY">Companies</option><option value="MARKET">Market</option><option value="CONTACT">Public professional contacts</option></select></div>
            <label className="flex items-start gap-3 rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm text-slate-300"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1 h-4 w-4" /><span>I confirm this paid search request. Results may be incomplete and require human review.</span></label>
          </div>
          <button type="button" onClick={() => void research()} disabled={loading || !query.trim() || !confirmed || !status?.configured} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-5 py-3 font-bold text-slate-950 hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"><Search size={18} />{loading ? "Researching verified sources…" : "Start verified research"}</button>
        </section>

        {loading && <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900" aria-live="polite"><Loader /></div>}
        {error && <div className="mt-8 rounded-2xl border border-red-400/20 bg-red-400/5 p-5 text-sm text-red-200" role="alert">{error}</div>}
        {job && !loading && (
          <section className="mt-8 space-y-6" aria-live="polite">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-5"><div><p className="text-sm font-semibold">C. Research progress</p><p className="mt-1 text-sm text-slate-400">{job.query}</p></div><span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">{job.status}</span></div>
            {job.results.length ? job.results.map((result) => <ResultCard key={result.id} result={result} />) : <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">No evidence-backed company candidates were returned. Try a more specific query or verify provider coverage.</div>}
          </section>
        )}
      </div>
    </Layout>
  );
}
