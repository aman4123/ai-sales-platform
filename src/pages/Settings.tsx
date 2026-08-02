import { useEffect, useState } from "react";
import { Database, Mail, Search, ShieldCheck, UserRound } from "lucide-react";
import toast from "react-hot-toast";
import Layout from "../components/layout/Layout";
import { useAuth } from "../contexts/auth-context";
import { api, apiErrorMessage } from "../services/api";
import type { AiProvider, SettingsPayload, Theme } from "../types/api";

interface ProviderStatus {
  research: { enabled: boolean; configured: boolean; provider: string; message: string };
  email: { configured: boolean; provider: string; outboundEnabled: boolean; deliveryMode?: "disabled" | "test" | "live" };
  ai?: {
    configured: boolean;
    resolvedProvider: string;
    available: boolean;
    reason: string | null;
    budget: {
      mode: "DISABLED" | "LIMITED" | "INTERNAL_UNLIMITED";
      monthlyRequestLimit: number | null;
      warningThresholdPercent: number;
      used: number;
    };
  };
}

export default function Settings() {
  const { user, updateUser, logout } = useAuth();
  const current = user!;
  const [name, setName] = useState(current.name);
  const [company, setCompany] = useState(current.settings.company);
  const [organization, setOrganization] = useState(current.settings.organization ?? "");
  const email = current.email;
  const [signature, setSignature] = useState(current.settings.signature);
  const [provider, setProvider] = useState<AiProvider>(current.settings.aiProvider);
  const [theme, setTheme] = useState<Theme>(current.settings.theme);
  const [notifications, setNotifications] = useState(current.settings.notifications);
  const [timezone, setTimezone] = useState(current.settings.timezone ?? "UTC");
  const [language, setLanguage] = useState(current.settings.language ?? "en");
  const [retention, setRetention] = useState(current.settings.dataRetentionDays ?? 90);
  const [dailyLimit, setDailyLimit] = useState(current.settings.campaignDailyLimit ?? 25);
  const [senderName, setSenderName] = useState(current.settings.senderName ?? "");
  const [senderEmail, setSenderEmail] = useState(current.settings.senderEmail ?? "");
  const [unsubscribeFooter, setUnsubscribeFooter] = useState(current.settings.unsubscribeFooter ?? "");
  const [privacyMode, setPrivacyMode] = useState(current.settings.privacyMode ?? "STANDARD");
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteEmail, setDeleteEmail] = useState("");
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      api.get<{ data: { providerStatus: ProviderStatus } }>("/settings", { signal: controller.signal }),
      api.get<{ data: ProviderStatus["ai"] }>("/ai/status", { signal: controller.signal }),
    ])
      .then(([settingsResponse, aiResponse]) => setProviderStatus({
        ...settingsResponse.data.data.providerStatus,
        ai: aiResponse.data.data,
      }))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  async function saveSettings() {
    setSaving(true);
    try {
      const response = await api.put<{ data: { settings: SettingsPayload } }>("/settings", {
        name,
        company,
        email,
        signature,
        aiProvider: provider,
        theme,
        notifications,
        organization,
        timezone,
        language,
        dataRetentionDays: retention,
        campaignDailyLimit: dailyLimit,
        senderName,
        senderEmail,
        unsubscribeFooter,
        privacyMode,
      });
      const saved = response.data.data.settings;
      updateUser({ ...current, name: saved.name, email: saved.email, settings: { ...current.settings, ...saved } });
      toast.success("Settings saved.");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not save settings."));
    } finally {
      setSaving(false);
    }
  }

  async function deleteAccount() {
    if (!deleteConfirmed || deleteEmail.trim().toLowerCase() !== email) return;
    if (!window.confirm("Permanently delete this account and all user-owned data? This cannot be undone.")) return;
    try {
      await api.delete("/settings/account", { data: { confirm: "DELETE", email: deleteEmail } });
      await logout().catch(() => undefined);
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not delete the account."));
    }
  }

  const fieldClass = "mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3";
  return <Layout><div className="mx-auto max-w-6xl"><p className="text-sm font-semibold uppercase tracking-[.18em] text-cyan-300">Configuration</p><h1 className="mt-2 text-4xl font-bold">Settings</h1><p className="mt-3 text-slate-400">Manage identity, provider status, limits, privacy, and campaign defaults. Provider secrets are never displayed.</p>
    <div className="mt-8 grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6"><h2 className="flex items-center gap-2 text-lg font-semibold"><UserRound size={19} className="text-cyan-300" /> Profile and organization</h2><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm text-slate-300">Full name<input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={100} required className={fieldClass} /></label><label className="text-sm text-slate-300">Company<input value={company} onChange={(event) => setCompany(event.target.value)} maxLength={160} className={fieldClass} /></label><label className="text-sm text-slate-300">Organization<input value={organization} onChange={(event) => setOrganization(event.target.value)} maxLength={160} className={fieldClass} /></label><label className="text-sm text-slate-300">Business email<input type="email" value={email} readOnly className={`${fieldClass} cursor-not-allowed opacity-60`} /></label><label className="text-sm text-slate-300">Timezone<input value={timezone} onChange={(event) => setTimezone(event.target.value)} placeholder="Asia/Kolkata" className={fieldClass} /></label><label className="text-sm text-slate-300">Language<select value={language} onChange={(event) => setLanguage(event.target.value)} className={fieldClass}><option value="en">English</option></select></label></div></section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck size={19} className="text-cyan-300" /> Provider status</h2>
        <div className="mt-5 space-y-3">
          <div className="rounded-xl bg-slate-950 p-4"><p className="flex items-center gap-2 font-medium"><Search size={17} /> Research</p><p className="mt-2 text-sm text-slate-400">{providerStatus?.research.configured ? `${providerStatus.research.provider} configured` : providerStatus?.research.message ?? "Checking configuration…"}</p></div>
          <div className="rounded-xl bg-slate-950 p-4">
            <p className="font-medium">AI access</p>
            <p className="mt-2 text-sm text-slate-400">{providerStatus?.ai?.configured ? `${providerStatus.ai.resolvedProvider} configured` : "Groq not configured"} · {providerStatus?.ai?.budget?.mode.replaceAll("_", " ").toLowerCase() ?? "checking budget"}{providerStatus?.ai?.budget?.monthlyRequestLimit ? ` · ${providerStatus.ai.budget.used}/${providerStatus.ai.budget.monthlyRequestLimit} used` : ""}</p>
            {providerStatus?.ai?.reason && <p className="mt-2 text-xs text-amber-200">{providerStatus.ai.reason}</p>}
          </div>
          <div className="rounded-xl bg-slate-950 p-4"><p className="flex items-center gap-2 font-medium"><Mail size={17} /> Email delivery</p><p className="mt-2 text-sm text-slate-400">{providerStatus?.email.configured ? `${providerStatus.email.provider} configured` : "Not configured"} · outbound {providerStatus?.email.outboundEnabled ? "enabled" : "disabled"} · {providerStatus?.email.deliveryMode ?? "disabled"} mode</p></div>
          <p className="text-xs text-slate-500">Keys remain server-side. Only configured/not configured state is returned.</p>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm text-slate-300">AI provider<select value={provider} onChange={(event) => setProvider(event.target.value as AiProvider)} className={fieldClass}><option value="MOCK">Mock AI</option><option value="GROQ">Groq</option></select></label><label className="text-sm text-slate-300">Theme<select value={theme} onChange={(event) => setTheme(event.target.value as Theme)} className={fieldClass}><option value="DARK">Dark</option><option value="LIGHT">Light</option><option value="SYSTEM">System</option></select></label></div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6"><h2 className="flex items-center gap-2 text-lg font-semibold"><Mail size={19} className="text-cyan-300" /> Sender identity</h2><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm text-slate-300">Sender name<input value={senderName} onChange={(event) => setSenderName(event.target.value)} maxLength={120} className={fieldClass} /></label><label className="text-sm text-slate-300">Sender email<input type="email" value={senderEmail} onChange={(event) => setSenderEmail(event.target.value)} maxLength={254} className={fieldClass} /></label></div><label className="mt-4 block text-sm text-slate-300">Exact saved signature<textarea value={signature} onChange={(event) => setSignature(event.target.value)} rows={4} maxLength={5000} className={fieldClass} /></label><label className="mt-4 block text-sm text-slate-300">Unsubscribe footer<textarea value={unsubscribeFooter} onChange={(event) => setUnsubscribeFooter(event.target.value)} rows={3} maxLength={1000} className={fieldClass} /></label><p className="mt-2 text-xs text-slate-500">A non-empty unsubscribe footer is required before approved campaign messages can send.</p></section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6"><h2 className="flex items-center gap-2 text-lg font-semibold"><Database size={19} className="text-cyan-300" /> Limits and privacy</h2><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm text-slate-300">Campaign daily limit<input type="number" min={1} max={1000} value={dailyLimit} onChange={(event) => setDailyLimit(Number(event.target.value))} className={fieldClass} /></label><label className="text-sm text-slate-300">Data retention days<input type="number" min={30} max={3650} value={retention} onChange={(event) => setRetention(Number(event.target.value))} className={fieldClass} /></label><label className="text-sm text-slate-300">Privacy mode<select value={privacyMode} onChange={(event) => setPrivacyMode(event.target.value)} className={fieldClass}><option value="STANDARD">Standard</option><option value="MINIMAL_RETENTION">Minimal retention</option></select></label><label className="flex items-center gap-3 self-end rounded-xl bg-slate-950 p-3 text-sm"><input type="checkbox" checked={notifications} onChange={() => setNotifications((value) => !value)} /> Email notifications</label></div><p className="mt-4 text-xs text-slate-500">Deployment-wide AI, search, and outbound limits are controlled by the server and cannot be raised here.</p></section>
    </div><button type="button" onClick={() => void saveSettings()} disabled={saving} className="mt-6 w-full rounded-xl bg-cyan-300 py-4 font-bold text-slate-950 disabled:opacity-50">{saving ? "Saving…" : "Save settings"}</button>
    <section className="mt-8 rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6"><h2 className="text-lg font-semibold text-rose-200">Delete account</h2><p className="mt-2 text-sm text-slate-400">This permanently removes the account and all user-owned CRM, research, campaign, and session records through database cascades.</p><label className="mt-4 block text-sm text-slate-300">Type your account email<input type="email" value={deleteEmail} onChange={(event) => setDeleteEmail(event.target.value)} className={fieldClass} /></label><label className="mt-4 flex items-start gap-3 text-sm text-slate-300"><input type="checkbox" checked={deleteConfirmed} onChange={(event) => setDeleteConfirmed(event.target.checked)} className="mt-1" /><span>I understand this deletion is permanent.</span></label><button type="button" onClick={() => void deleteAccount()} disabled={!deleteConfirmed || deleteEmail.trim().toLowerCase() !== email} className="mt-4 rounded-xl border border-rose-500/50 px-4 py-2 font-semibold text-rose-200 disabled:opacity-40">Permanently delete account</button></section>
  </div></Layout>;
}
