import { useState } from "react";
import toast from "react-hot-toast";
import Layout from "../components/layout/Layout";
import { useAuth } from "../contexts/auth-context";
import { api, apiErrorMessage } from "../services/api";
import type { AiProvider, SettingsPayload, Theme } from "../types/api";

export default function Settings() {
  const { user, updateUser } = useAuth();
  const current = user!;
  const [name, setName] = useState(current.name);
  const [company, setCompany] = useState(current.settings.company);
  const email = current.email;
  const [signature, setSignature] = useState(current.settings.signature);
  const [provider, setProvider] = useState<AiProvider>(current.settings.aiProvider);
  const [theme, setTheme] = useState<Theme>(current.settings.theme);
  const [notifications, setNotifications] = useState(current.settings.notifications);
  const [saving, setSaving] = useState(false);

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
      });
      const saved = response.data.data.settings;
      updateUser({
        ...current,
        name: saved.name,
        email: saved.email,
        settings: {
          company: saved.company,
          signature: saved.signature,
          aiProvider: saved.aiProvider,
          theme: saved.theme,
          notifications: saved.notifications,
        },
      });
      toast.success("Settings Saved Successfully!");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not save settings."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout>
      <h1 className="text-4xl font-bold">Settings</h1>
      <p className="mt-2 text-slate-400">Manage your AI Sales Platform preferences.</p>

      <div className="mt-8 space-y-8">
        <div className="rounded-xl bg-slate-900 p-6">
          <h2 className="mb-5 text-2xl font-semibold">👤 Profile</h2>
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-slate-400" htmlFor="settings-name">Full Name</label>
              <input id="settings-name" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={100} required className="w-full rounded-lg bg-slate-800 p-3" />
            </div>
            <div>
              <label className="mb-2 block text-slate-400" htmlFor="settings-company">Company</label>
              <input id="settings-company" value={company} onChange={(event) => setCompany(event.target.value)} maxLength={160} className="w-full rounded-lg bg-slate-800 p-3" />
            </div>
            <div className="md:col-span-2">
              <label className="mb-2 block text-slate-400" htmlFor="settings-email">Business Email</label>
              <input id="settings-email" type="email" value={email} readOnly aria-describedby="settings-email-help" className="w-full cursor-not-allowed rounded-lg bg-slate-800 p-3 opacity-75" />
              <p id="settings-email-help" className="mt-2 text-sm text-slate-500">Email changes require a separately verified account workflow and are disabled here.</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-slate-900 p-6">
          <h2 className="mb-5 text-2xl font-semibold">🤖 AI Settings</h2>
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-slate-400" htmlFor="settings-provider">AI Provider</label>
              <select id="settings-provider" value={provider} onChange={(event) => setProvider(event.target.value as AiProvider)} className="w-full rounded-lg bg-slate-800 p-3">
                <option value="MOCK">Mock AI</option><option value="DEEPSEEK">DeepSeek</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-slate-400" htmlFor="settings-theme">Theme</label>
              <select id="settings-theme" value={theme} onChange={(event) => setTheme(event.target.value as Theme)} className="w-full rounded-lg bg-slate-800 p-3">
                <option value="DARK">Dark</option><option value="LIGHT">Light</option><option value="SYSTEM">System</option>
              </select>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-slate-900 p-6">
          <h2 className="mb-5 text-2xl font-semibold">📧 Email Settings</h2>
          <label className="mb-2 block text-slate-400" htmlFor="settings-signature">Default Signature</label>
          <textarea id="settings-signature" rows={5} value={signature} onChange={(event) => setSignature(event.target.value)} maxLength={5000} className="w-full rounded-lg bg-slate-800 p-3" />
          <div className="mt-6 flex items-center justify-between">
            <label htmlFor="settings-notifications">Email Notifications</label>
            <input id="settings-notifications" type="checkbox" checked={notifications} onChange={() => setNotifications((enabled) => !enabled)} className="h-5 w-5" />
          </div>
        </div>

        <div className="rounded-xl bg-slate-900 p-6">
          <button type="button" onClick={() => void saveSettings()} disabled={saving} className="w-full rounded-lg bg-blue-600 py-4 text-lg font-semibold hover:bg-blue-700 disabled:opacity-50">
            {saving ? "Saving..." : "💾 Save Settings"}
          </button>
        </div>
      </div>
    </Layout>
  );
}
