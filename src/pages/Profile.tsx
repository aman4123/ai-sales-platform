import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/layout/Layout";
import { useAuth } from "../contexts/auth-context";
import { api, apiErrorMessage } from "../services/api";

export default function Profile() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const settings = user!.settings;
  const [password, setPassword] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [recoveryError, setRecoveryError] = useState("");
  const [generating, setGenerating] = useState(false);

  async function regenerateRecoveryCodes() {
    setGenerating(true);
    setRecoveryError("");
    try {
      const response = await api.post<{ data: { recoveryCodes: string[] } }>(
        "/auth/recovery-codes",
        { password },
      );
      setRecoveryCodes(response.data.data.recoveryCodes);
      setPassword("");
    } catch (error) {
      setRecoveryError(apiErrorMessage(error, "Could not generate recovery codes."));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Layout>
      <h1 className="text-4xl font-bold">My Profile</h1>
      <p className="mt-2 text-slate-400">View your account information.</p>
      <div className="mt-8 rounded-xl bg-slate-900 p-8">
        <div className="flex flex-col items-center">
          <div className="flex h-28 w-28 items-center justify-center rounded-full bg-blue-600 text-5xl font-bold">
            {user!.name.charAt(0).toUpperCase()}
          </div>
          <h2 className="mt-4 text-3xl font-bold">{user!.name}</h2>
          <p className="text-slate-400">{user!.role === "ADMIN" ? "Administrator" : "Member"}</p>
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <div className="rounded-lg bg-slate-800 p-5"><p className="text-slate-400">Company</p><h3 className="mt-2 text-xl">{settings.company || "Not Set"}</h3></div>
          <div className="rounded-lg bg-slate-800 p-5"><p className="text-slate-400">Business Email</p><h3 className="mt-2 text-xl">{user!.email}</h3></div>
          <div className="rounded-lg bg-slate-800 p-5"><p className="text-slate-400">AI Provider</p><h3 className="mt-2 text-xl">{settings.aiProvider === "DEEPSEEK" ? "DeepSeek" : "Mock AI"}</h3></div>
          <div className="rounded-lg bg-slate-800 p-5"><p className="text-slate-400">Theme</p><h3 className="mt-2 text-xl">{settings.theme[0] + settings.theme.slice(1).toLowerCase()}</h3></div>
          <div className="rounded-lg bg-slate-800 p-5 md:col-span-2"><p className="text-slate-400">Notifications</p><h3 className="mt-2 text-xl">{settings.notifications ? "Enabled" : "Disabled"}</h3></div>
        </div>
        <button onClick={() => navigate("/settings")} className="mt-10 rounded-lg bg-blue-600 px-8 py-4 hover:bg-blue-700">Edit Profile</button>
        <section className="mt-10 border-t border-slate-700 pt-8" aria-labelledby="recovery-heading">
          <h3 id="recovery-heading" className="text-2xl font-semibold">Account recovery</h3>
          <p className="mt-2 text-slate-400">Generating new codes permanently invalidates every previous recovery code.</p>
          {recoveryCodes.length > 0 ? (
            <>
              <p role="status" className="mt-4 text-amber-300">Save these one-time codes now. They will not be shown again.</p>
              <ul className="mt-4 grid gap-2 rounded bg-slate-950 p-4 font-mono text-sm sm:grid-cols-2" aria-label="New recovery codes">
                {recoveryCodes.map((code) => <li key={code}>{code}</li>)}
              </ul>
            </>
          ) : (
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <div className="flex-1">
                <label className="sr-only" htmlFor="recovery-current-password">Current password</label>
                <input id="recovery-current-password" type="password" autoComplete="current-password" placeholder="Current password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-lg bg-slate-800 p-3" />
              </div>
              <button type="button" disabled={!password || generating} onClick={() => void regenerateRecoveryCodes()} className="rounded-lg bg-slate-700 px-5 py-3 hover:bg-slate-600 disabled:opacity-50">{generating ? "Generating..." : "Generate new codes"}</button>
            </div>
          )}
          {recoveryError && <p role="alert" className="mt-4 text-sm text-red-400">{recoveryError}</p>}
        </section>
      </div>
    </Layout>
  );
}
