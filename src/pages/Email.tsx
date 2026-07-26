import { useState } from "react";
import { Clipboard, Eraser, Sparkles } from "lucide-react";
import toast from "react-hot-toast";
import Layout from "../components/layout/Layout";
import Loader from "../components/ui/Loader";
import { generateEmailWithAI } from "../services/ai";
import { apiErrorMessage } from "../services/api";

type EmailTone = "Professional" | "Friendly" | "Sales" | "Formal";

export default function Email() {
  const [company, setCompany] = useState("");
  const [contact, setContact] = useState("");
  const [industry, setIndustry] = useState("");
  const [tone, setTone] = useState<EmailTone>("Professional");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  async function generateEmail() {
    if (!company.trim() || !contact.trim() || !industry.trim()) {
      toast.error("Company, contact, and industry are required.");
      return;
    }
    setLoading(true);
    try {
      const response = await generateEmailWithAI({ company, contact, industry, tone });
      setEmail(response);
      toast.success("Email draft generated for review.");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Something went wrong while generating the email."));
    } finally {
      setLoading(false);
    }
  }

  async function copyEmail() {
    if (!email) {
      toast.error("Generate an email before copying it.");
      return;
    }
    try {
      await navigator.clipboard.writeText(email);
      toast.success("Email copied.");
    } catch {
      toast.error("The email could not be copied. Select the text and copy it manually.");
    }
  }

  function clearAll() {
    setCompany("");
    setContact("");
    setIndustry("");
    setTone("Professional");
    setEmail("");
  }

  const fieldClass = "mt-2 w-full rounded-xl border border-white/10 bg-white/[.04] p-3.5 text-white placeholder:text-slate-500 focus:border-cyan-300/50 focus:outline-none";

  return (
    <Layout>
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-bold uppercase tracking-[.2em] text-cyan-300">Grounded messaging</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-white">Email Studio</h1>
        <p className="mt-3 max-w-2xl text-slate-400">Create a natural B2B draft from only the details you provide and your saved signature. Review every message before use.</p>

        <div className="mt-8 grid gap-6 lg:grid-cols-[.85fr_1.15fr]">
          <section className="rounded-2xl border border-white/10 bg-[#0a141e] p-6">
            <h2 className="flex items-center gap-2 font-semibold text-white"><Sparkles size={19} className="text-cyan-300" /> Draft inputs</h2>
            <div className="mt-5 space-y-4">
              <label className="block text-sm text-slate-300" htmlFor="email-company">Company name<input id="email-company" placeholder="Acme Logistics" value={company} onChange={(event) => setCompany(event.target.value)} maxLength={160} className={fieldClass} /></label>
              <label className="block text-sm text-slate-300" htmlFor="email-contact">Contact name<input id="email-contact" placeholder="Jordan Lee" value={contact} onChange={(event) => setContact(event.target.value)} maxLength={160} className={fieldClass} /></label>
              <label className="block text-sm text-slate-300" htmlFor="email-industry">Industry<input id="email-industry" placeholder="Logistics" value={industry} onChange={(event) => setIndustry(event.target.value)} maxLength={160} className={fieldClass} /></label>
              <label className="block text-sm text-slate-300" htmlFor="email-tone">Email tone<select id="email-tone" value={tone} onChange={(event) => setTone(event.target.value as EmailTone)} className={fieldClass}><option>Professional</option><option>Friendly</option><option>Sales</option><option>Formal</option></select></label>
            </div>
            <button type="button" onClick={() => void generateEmail()} disabled={loading} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-300 px-5 py-3.5 font-bold text-slate-950 hover:bg-cyan-200 disabled:opacity-50"><Sparkles size={18} /> {loading ? "Generating…" : "Generate Email"}</button>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#0a141e] p-6">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-white">Review draft</h2><p className="mt-1 text-sm text-slate-500">Nothing is sent from this screen.</p></div><div className="flex gap-2"><button type="button" onClick={() => void copyEmail()} disabled={!email || loading} className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-3.5 py-2 text-sm font-semibold hover:bg-white/5 disabled:opacity-40"><Clipboard size={16} /> Copy</button><button type="button" onClick={clearAll} className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-3.5 py-2 text-sm font-semibold hover:bg-white/5"><Eraser size={16} /> Clear</button></div></div>
            {loading ? <div className="mt-5 min-h-96 rounded-xl border border-white/10 bg-white/[.025]"><Loader /></div> : email ? <textarea aria-label="Generated email" value={email} readOnly className="mt-5 h-96 w-full resize-y whitespace-pre-wrap rounded-xl border border-white/10 bg-white/[.025] p-5 leading-7 text-slate-200 focus:border-cyan-300/40 focus:outline-none" /> : <div className="mt-5 grid min-h-96 place-items-center rounded-xl border border-dashed border-white/15 bg-white/[.015] p-8 text-center"><div><Sparkles className="mx-auto text-slate-600" size={30} /><p className="mt-4 font-semibold text-slate-300">Your reviewed draft will appear here.</p><p className="mt-2 text-sm text-slate-500">Add the known details, choose a tone, and generate.</p></div></div>}
          </section>
        </div>
      </div>
    </Layout>
  );
}
