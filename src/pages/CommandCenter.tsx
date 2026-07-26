import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Gauge, Search, Send, Users, type LucideIcon } from "lucide-react";
import toast from "react-hot-toast";
import Layout from "../components/layout/Layout";
import { apiErrorMessage } from "../services/api";
import {
  confirmSalesGoal,
  createSalesGoal,
  getCommandOverview,
  type CommandOverview,
  type SalesGoal,
} from "../services/v2";

export default function CommandCenter() {
  const [goal, setGoal] = useState("");
  const [productService, setProductService] = useState("");
  const [targetIndustry, setTargetIndustry] = useState("");
  const [geography, setGeography] = useState("");
  const [buyerRole, setBuyerRole] = useState("");
  const [dailyLimit, setDailyLimit] = useState(25);
  const [draft, setDraft] = useState<SalesGoal | null>(null);
  const [overview, setOverview] = useState<CommandOverview | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void getCommandOverview(controller.signal).then(setOverview).catch(() => undefined);
    return () => controller.abort();
  }, []);

  async function buildPlan(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      setDraft(
        await createSalesGoal({
          goal,
          ...(productService.trim() ? { productService } : {}),
          ...(targetIndustry.trim() ? { targetIndustry } : {}),
          ...(geography.trim() ? { geography } : {}),
          ...(buyerRole.trim() ? { preferredBuyerRole: buyerRole } : {}),
          dailySendingLimit: dailyLimit,
        }),
      );
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not prepare the campaign plan."));
    } finally {
      setLoading(false);
    }
  }

  async function confirmPlan() {
    if (!draft) return;
    try {
      setDraft(await confirmSalesGoal(draft.id));
      toast.success("Plan confirmed. Paid research and outreach still require separate approval.");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not confirm the plan."));
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-semibold uppercase tracking-[.18em] text-cyan-300">Human-controlled orchestration</p>
        <h1 className="mt-2 text-4xl font-bold">Command Center</h1>
        <p className="mt-3 max-w-3xl text-slate-400">Translate a high-level sales goal into a draft operating plan. Nothing here starts paid research, adds leads, or launches outreach.</p>

        {overview && (
          <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Current operating status">
            {([
              [ClipboardCheck, "Pending approvals", overview.pendingApprovals],
              [Users, "Human responses", overview.humanResponsesNeeded],
              [Search, "Search requests", overview.usage.searchRequests],
              [Gauge, "AI requests (30d)", overview.usage.aiRequestsLast30Days],
            ] satisfies Array<[LucideIcon, string, number]>).map(([Icon, label, value]) => (
              <div key={String(label)} className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><Icon className="text-cyan-300" size={20} aria-hidden="true" /><p className="mt-5 text-sm text-slate-400">{String(label)}</p><p className="mt-1 text-3xl font-bold">{String(value)}</p></div>
            ))}
          </section>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-[.85fr_1.15fr]">
          <form onSubmit={buildPlan} className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-lg font-semibold">Describe the outcome</h2>
            <label htmlFor="command-goal" className="mt-5 block text-sm text-slate-300">Sales goal</label>
            <textarea id="command-goal" value={goal} onChange={(event) => setGoal(event.target.value)} minLength={5} maxLength={1000} required rows={5} placeholder="I want to sell our product to a defined B2B market." className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-4" />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-slate-300">Product or service<input value={productService} onChange={(event) => setProductService(event.target.value)} maxLength={500} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3" /></label>
              <label className="text-sm text-slate-300">Target industry<input value={targetIndustry} onChange={(event) => setTargetIndustry(event.target.value)} maxLength={160} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3" /></label>
              <label className="text-sm text-slate-300">Geography<input value={geography} onChange={(event) => setGeography(event.target.value)} maxLength={160} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3" /></label>
              <label className="text-sm text-slate-300">Preferred buyer role<input value={buyerRole} onChange={(event) => setBuyerRole(event.target.value)} maxLength={160} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3" /></label>
              <label className="text-sm text-slate-300 sm:col-span-2">Proposed daily limit<input type="number" min={1} max={100} value={dailyLimit} onChange={(event) => setDailyLimit(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3" /></label>
            </div>
            <button disabled={loading || !goal.trim()} className="mt-5 w-full rounded-xl bg-cyan-300 px-5 py-3 font-bold text-slate-950 hover:bg-cyan-200 disabled:opacity-40">{loading ? "Preparing…" : "Prepare draft plan"}</button>
          </form>

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6" aria-live="polite">
            <div className="flex items-center justify-between gap-4"><h2 className="text-lg font-semibold">Draft campaign plan</h2>{draft && <span className={`rounded-full px-3 py-1 text-xs font-semibold ${draft.status === "CONFIRMED" ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-300/10 text-amber-200"}`}>{draft.status}</span>}</div>
            {!draft ? <div className="grid min-h-[420px] place-items-center text-center text-slate-500"><div><Send className="mx-auto mb-4" size={32} /><p>Your structured plan will appear here for review.</p></div></div> : (
              <div className="mt-6 space-y-5">
                <div className="rounded-xl bg-slate-800 p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Objective</p><p className="mt-2 text-sm leading-6">{draft.plan.objective}</p></div>
                <div className="grid gap-3 sm:grid-cols-2">{Object.entries(draft.plan.targetMarket).map(([key, value]) => <div key={key} className="rounded-xl border border-slate-800 p-4"><p className="text-xs uppercase text-slate-500">{key}</p><p className="mt-2 text-sm">{value}</p></div>)}</div>
                <div><h3 className="text-sm font-semibold">Research strategy</h3><p className="mt-2 text-sm leading-6 text-slate-400">{draft.plan.researchStrategy}</p></div>
                <div><h3 className="text-sm font-semibold">Email and follow-up</h3><p className="mt-2 text-sm leading-6 text-slate-400">{draft.plan.emailApproach} {draft.plan.followUpPlan}</p></div>
                <div className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-4"><h3 className="flex items-center gap-2 text-sm font-semibold text-amber-100"><AlertTriangle size={17} /> Required approvals</h3><ul className="mt-3 grid gap-2 text-sm text-amber-100/75 sm:grid-cols-2">{draft.plan.requiredApprovals.map((item) => <li key={item}>• {item}</li>)}</ul></div>
                {draft.status === "DRAFT" && <button type="button" onClick={() => void confirmPlan()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-5 py-3 font-semibold text-cyan-200 hover:bg-cyan-300/15"><CheckCircle2 size={18} /> Confirm plan only</button>}
              </div>
            )}
          </section>
        </div>
      </div>
    </Layout>
  );
}
