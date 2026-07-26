import {
  ArrowRight,
  CheckCircle2,
  Database,
  FileCheck2,
  LockKeyhole,
  MailCheck,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { Link } from "react-router";

const workflow = [
  ["01", "Define the goal", "Describe the product, market, geography, and outreach objective."],
  ["02", "Find verified prospects", "Configured search providers collect public sources and retain evidence."],
  ["03", "Generate grounded outreach", "Groq sees retrieved evidence only; unsupported facts are rejected."],
  ["04", "Review and approve", "Recipients, sender identity, messages, sequence, and limits stay human-controlled."],
  ["05", "Track and respond", "Replies and opt-outs stop follow-ups and return judgment to a person."],
] as const;

const features = [
  [SearchCheck, "Verified research", "Source-linked company facts with confidence and conflict warnings."],
  [Sparkles, "Explainable lead scoring", "Fit scores show their criteria, evidence quality, freshness, and risk penalties."],
  [FileCheck2, "Campaign builder", "Move from audience criteria to an approval-ready sequence without hidden sends."],
  [MailCheck, "Grounded email drafts", "Drafts use verified evidence, your value proposition, and the exact saved signature."],
  [UsersRound, "Human approval", "Content changes invalidate approval. Launch always requires confirmation."],
  [Database, "CRM synchronization", "Companies, contacts, deals, evidence, and activity stay connected."],
  [ShieldCheck, "Response safeguards", "Replies, bounces, complaints, and opt-outs stop future automation."],
  [LockKeyhole, "Usage controls", "Monthly search and AI budgets combine with bounded daily sending limits."],
] as const;

const faqs = [
  ["Does the platform search the web by itself?", "Only when an administrator enables and configures a supported search provider and you confirm the paid request."],
  ["Can AI send an email without approval?", "No. A recipient list, current message version, sender identity, sequence, and limits must be approved first."],
  ["What happens when data cannot be verified?", "The field stays unknown. The research workspace shows it as not verified instead of filling it with a guess."],
  ["Are opens and clicks reported?", "Only when a configured provider supplies those events. Unavailable metrics remain clearly labeled unavailable."],
] as const;

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#071018] text-slate-100">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-cyan-300 focus:px-4 focus:py-2 focus:text-slate-950">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#071018]/90 backdrop-blur-xl">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8" aria-label="Public navigation">
          <Link to="/" className="flex items-center gap-3 font-semibold tracking-tight">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-300 font-black text-slate-950">AS</span>
            <span>AI Sales Platform</span>
          </Link>
          <div className="hidden items-center gap-7 text-sm text-slate-300 md:flex">
            <a href="#workflow" className="hover:text-white">How it works</a>
            <a href="#features" className="hover:text-white">Features</a>
            <a href="#security" className="hover:text-white">Security</a>
            <a href="#pricing" className="hover:text-white">Pricing</a>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/login" className="rounded-xl px-4 py-2 text-sm font-medium hover:bg-white/5">Log in</Link>
            <Link to="/register" className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-cyan-200">Start Free</Link>
          </div>
        </nav>
      </header>

      <main id="main">
        <section className="relative overflow-hidden px-5 pb-24 pt-20 lg:px-8 lg:pb-32 lg:pt-28">
          <div className="pointer-events-none absolute left-1/2 top-0 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-16 lg:grid-cols-[1.05fr_.95fr]">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/5 px-4 py-2 text-sm text-cyan-200">
                <ShieldCheck size={16} aria-hidden="true" /> Evidence first. Humans in control.
              </div>
              <h1 className="max-w-3xl text-5xl font-black leading-[1.02] tracking-[-0.045em] text-white sm:text-6xl lg:text-7xl">
                Turn a sales goal into <span className="text-cyan-300">approved outreach.</span>
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">
                Research public company evidence, prioritize possible-fit leads, draft grounded emails, and keep every send behind explicit approval.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link to="/register" className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-300 px-6 py-3.5 font-bold text-slate-950 hover:bg-cyan-200">
                  Start Free <ArrowRight size={18} aria-hidden="true" />
                </Link>
                <a href="#workflow" className="inline-flex items-center justify-center rounded-xl border border-white/15 px-6 py-3.5 font-semibold hover:border-white/30 hover:bg-white/5">
                  See How It Works
                </a>
              </div>
              <p className="mt-5 text-sm text-slate-500">Search and outbound delivery remain disabled until providers and budgets are configured.</p>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-slate-900/75 p-3 shadow-2xl shadow-cyan-950/40">
              <div className="rounded-[22px] border border-white/10 bg-[#0b1621] p-5 sm:p-6">
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[.18em] text-cyan-300">Campaign review</p>
                    <p className="mt-1 font-semibold">Logistics market — India</p>
                  </div>
                  <span className="rounded-full bg-amber-300/10 px-3 py-1 text-xs font-semibold text-amber-200">Approval required</span>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  {["Evidence collected", "Recipients selected", "Drafts ready"].map((label, index) => (
                    <div key={label} className="rounded-xl border border-white/10 bg-white/[.03] p-3">
                      <p className="text-xs text-slate-500">Step {index + 1}</p>
                      <p className="mt-2 text-sm font-medium">{label}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-xl border border-white/10 bg-white/[.025] p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-300/10 text-emerald-300"><CheckCircle2 size={18} /></span>
                      <div><p className="text-sm font-semibold">Verified source record</p><p className="text-xs text-slate-500">Field-level evidence retained</p></div>
                    </div>
                    <span className="text-xs text-emerald-300">Source linked</span>
                  </div>
                </div>
                <div className="mt-3 rounded-xl border border-white/10 bg-white/[.025] p-4">
                  <p className="text-xs uppercase tracking-[.15em] text-slate-500">Draft preview</p>
                  <p className="mt-3 text-sm font-semibold">Subject: A practical idea for your sales workflow</p>
                  <p className="mt-3 text-sm leading-6 text-slate-400">Grounded company context appears here only after evidence is available. The sender reviews every line before approval.</p>
                </div>
                <button type="button" disabled className="mt-4 w-full rounded-xl bg-cyan-300/70 px-4 py-3 font-bold text-slate-950 disabled:cursor-not-allowed" aria-label="Approve and schedule preview, disabled">
                  Review recipients and messages
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-white/10 bg-white/[.025] px-5 py-10 lg:px-8" aria-label="Trust and safety principles">
          <div className="mx-auto grid max-w-7xl gap-6 md:grid-cols-3">
            {[
              [SearchCheck, "Evidence-based research", "No evidence means the field remains unknown."],
              [FileCheck2, "Approval before outreach", "Changed content or recipients require re-approval."],
              [ShieldCheck, "Privacy and anti-spam controls", "Public professional data, suppression, limits, and stop conditions."],
            ].map(([Icon, title, description]) => (
              <div key={String(title)} className="flex gap-4">
                <Icon className="mt-1 shrink-0 text-cyan-300" size={22} aria-hidden="true" />
                <div><h2 className="font-semibold text-white">{String(title)}</h2><p className="mt-1 text-sm leading-6 text-slate-400">{String(description)}</p></div>
              </div>
            ))}
          </div>
        </section>

        <section id="workflow" className="scroll-mt-24 px-5 py-24 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <p className="text-sm font-bold uppercase tracking-[.2em] text-cyan-300">Workflow</p>
            <div className="mt-4 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
              <h2 className="max-w-2xl text-4xl font-bold tracking-tight text-white sm:text-5xl">A visible path from intent to outreach.</h2>
              <p className="max-w-xl text-slate-400">Automation prepares the work. Evidence, approval, and safety state remain visible throughout.</p>
            </div>
            <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 lg:grid-cols-5">
              {workflow.map(([step, title, description]) => (
                <article key={step} className="bg-[#0a141e] p-6">
                  <p className="font-mono text-sm text-cyan-300">{step}</p>
                  <h3 className="mt-8 font-semibold text-white">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-400">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="scroll-mt-24 bg-[#0a141e] px-5 py-24 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <p className="text-sm font-bold uppercase tracking-[.2em] text-cyan-300">Capabilities</p>
            <h2 className="mt-4 max-w-2xl text-4xl font-bold tracking-tight text-white sm:text-5xl">One operating system for careful outbound.</h2>
            <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {features.map(([Icon, title, description]) => (
                <article key={title} className="rounded-2xl border border-white/10 bg-white/[.025] p-6">
                  <Icon className="text-cyan-300" size={24} aria-hidden="true" />
                  <h3 className="mt-6 font-semibold text-white">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-400">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="scroll-mt-24 px-5 py-24 lg:px-8">
          <div className="mx-auto max-w-7xl text-center">
            <p className="text-sm font-bold uppercase tracking-[.2em] text-cyan-300">Pricing</p>
            <h2 className="mt-4 text-4xl font-bold text-white">Plans are being finalized.</h2>
            <div className="mt-12 grid gap-5 text-left md:grid-cols-3">
              {["Free", "Pro", "Business"].map((plan) => (
                <article key={plan} className="rounded-2xl border border-white/10 bg-slate-900/60 p-7">
                  <div className="flex items-center justify-between"><h3 className="text-xl font-bold">{plan}</h3><span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-400">Coming soon</span></div>
                  <p className="mt-6 text-sm leading-6 text-slate-400">Feature limits and provider costs will be published before paid access is enabled.</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="security" className="scroll-mt-24 border-y border-white/10 bg-cyan-300 px-5 py-20 text-slate-950 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-2 lg:items-center">
            <div><p className="text-sm font-black uppercase tracking-[.2em]">Security & compliance</p><h2 className="mt-4 text-4xl font-black tracking-tight">Controls that make restraint the default.</h2></div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {["User-owned resource authorization", "Provider keys stay server-side", "SSRF and prompt-injection defenses", "No raw provider errors or stack traces", "Immutable approval records", "Opt-out and complaint suppression", "Bounded budgets and retry limits", "Data retention controls"].map((item) => (
                <li key={item} className="flex items-start gap-2 rounded-xl bg-slate-950/10 p-3 text-sm font-semibold"><CheckCircle2 className="mt-0.5 shrink-0" size={17} aria-hidden="true" />{item}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="px-5 py-24 lg:px-8">
          <div className="mx-auto max-w-4xl">
            <p className="text-center text-sm font-bold uppercase tracking-[.2em] text-cyan-300">FAQ</p>
            <h2 className="mt-4 text-center text-4xl font-bold text-white">Clear answers, no inflated claims.</h2>
            <div className="mt-10 divide-y divide-white/10 rounded-2xl border border-white/10 px-6">
              {faqs.map(([question, answer]) => (
                <details key={question} className="group py-5">
                  <summary className="cursor-pointer list-none font-semibold text-white marker:hidden">{question}</summary>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 pb-24 lg:px-8">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-7 rounded-[28px] border border-cyan-300/20 bg-cyan-300/5 p-8 sm:p-12 lg:flex-row lg:items-center">
            <div><h2 className="text-3xl font-bold text-white">Build a campaign you can defend.</h2><p className="mt-3 text-slate-400">Start with a goal. Keep evidence and approval attached to every decision.</p></div>
            <Link to="/register" className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-cyan-300 px-6 py-3.5 font-bold text-slate-950 hover:bg-cyan-200">Start Free <ArrowRight size={18} /></Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 px-5 py-10 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <p>AI Sales Platform · Human-approved outreach</p>
          <nav className="flex flex-wrap gap-5" aria-label="Footer navigation">
            <Link to="/terms" className="hover:text-white">Terms</Link>
            <Link to="/privacy" className="hover:text-white">Privacy</Link>
            <Link to="/contact" className="hover:text-white">Contact</Link>
            <Link to="/login" className="hover:text-white">Login</Link>
            <Link to="/register" className="hover:text-white">Sign up</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
