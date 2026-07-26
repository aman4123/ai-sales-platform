import { useState } from "react";
import { KeyRound, Settings2, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router";
import Layout from "../components/layout/Layout";
import { useAuth } from "../contexts/auth-context";
import { api, apiErrorMessage } from "../services/api";

export default function Profile() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const current = user!;
  const settings = current.settings;
  const [password, setPassword] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [recoveryError, setRecoveryError] = useState("");
  const [generating, setGenerating] = useState(false);

  async function regenerateRecoveryCodes() {
    setGenerating(true);
    setRecoveryError("");
    try {
      const response = await api.post<{ data: { recoveryCodes: string[] } }>("/auth/recovery-codes", { password });
      setRecoveryCodes(response.data.data.recoveryCodes);
      setPassword("");
    } catch (error) {
      setRecoveryError(apiErrorMessage(error, "Could not generate recovery codes."));
    } finally {
      setGenerating(false);
    }
  }

  const roleLabel = current.accessMode === "MASTER_ADMIN"
    ? "Master Admin"
    : current.accessMode === "TESTER"
      ? "Tester Mode"
      : current.role === "ADMIN" ? "Administrator" : "User";
  const details = [
    ["Company", settings.company || "Not set"],
    ["Business email", current.email],
    ["AI provider", settings.aiProvider === "GROQ" ? "Groq" : "Mock AI"],
    ["Theme", settings.theme[0] + settings.theme.slice(1).toLowerCase()],
    ["Notifications", settings.notifications ? "Enabled" : "Disabled"],
    ["Current access", roleLabel],
  ];

  return (
    <Layout>
      <div className="mx-auto max-w-5xl">
        <p className="text-sm font-bold uppercase tracking-[.2em] text-cyan-300">Account</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-white">My profile</h1>
        <p className="mt-3 text-slate-400">Identity, workspace preferences, and account recovery.</p>

        <section className="mt-8 overflow-hidden rounded-[28px] border border-white/10 bg-[#0a141e]">
          <div className="flex flex-col items-center border-b border-white/10 bg-cyan-300/[.035] p-8 text-center">
            <div className="grid h-24 w-24 place-items-center rounded-3xl bg-cyan-300 text-4xl font-black text-slate-950 shadow-xl shadow-cyan-950/30">{current.name.charAt(0).toUpperCase()}</div>
            <h2 className="mt-5 text-3xl font-bold text-white">{current.name}</h2>
            <p className="mt-2 inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/[.05] px-3 py-1.5 text-sm font-semibold text-cyan-200"><ShieldCheck size={15} /> {roleLabel}</p>
          </div>

          <div className="grid gap-px bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
            {details.map(([label, value]) => <div key={label} className="bg-[#0a141e] p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 break-words font-semibold text-white">{value}</p></div>)}
          </div>
          <div className="p-6"><button type="button" onClick={() => navigate("/settings")} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-5 py-3 font-bold text-slate-950 hover:bg-cyan-200"><Settings2 size={18} /> Edit settings</button></div>
        </section>

        <section className="mt-6 rounded-2xl border border-white/10 bg-[#0a141e] p-6" aria-labelledby="recovery-heading">
          <h2 id="recovery-heading" className="flex items-center gap-2 text-xl font-semibold text-white"><KeyRound size={20} className="text-cyan-300" /> Account recovery</h2>
          <p className="mt-2 text-sm text-slate-400">Generating new codes permanently invalidates every previous recovery code.</p>
          {recoveryCodes.length > 0 ? (
            <>
              <p role="status" className="mt-4 text-amber-200">Save these one-time codes now. They will not be shown again.</p>
              <ul className="mt-4 grid gap-2 rounded-xl border border-white/10 bg-white/[.025] p-4 font-mono text-sm sm:grid-cols-2" aria-label="New recovery codes">
                {recoveryCodes.map((code) => <li key={code}>{code}</li>)}
              </ul>
            </>
          ) : (
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <div className="flex-1"><label className="sr-only" htmlFor="recovery-current-password">Current password</label><input id="recovery-current-password" type="password" autoComplete="current-password" placeholder="Current password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[.04] p-3.5 placeholder:text-slate-500 focus:border-cyan-300/50 focus:outline-none" /></div>
              <button type="button" disabled={!password || generating} onClick={() => void regenerateRecoveryCodes()} className="rounded-xl border border-white/15 px-5 py-3 font-semibold hover:border-cyan-300/25 hover:bg-white/5 disabled:opacity-50">{generating ? "Generating…" : "Generate new codes"}</button>
            </div>
          )}
          {recoveryError && <p role="alert" className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/[.05] p-3 text-sm text-rose-200">{recoveryError}</p>}
        </section>
      </div>
    </Layout>
  );
}
