import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import AuthShell from "../components/auth/AuthShell";
import { api, apiErrorMessage } from "../services/api";

export default function RecoverAccount() {
  const [email, setEmail] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [password, setPassword] = useState("");
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await api.post("/auth/recover", { email, recoveryCode, password });
      setComplete(true);
    } catch (requestError) {
      setError(apiErrorMessage(requestError, "Account recovery failed."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title="Recover account">
      {complete ? (
        <><p role="status" className="mt-6 text-slate-300">Your password was changed and existing sessions were signed out.</p><Link className="mt-6 block rounded bg-blue-600 py-3 text-center text-white" to="/login">Sign in</Link></>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div><label className="block text-sm text-slate-300" htmlFor="recovery-email">Email address</label><input id="recovery-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded bg-slate-800 p-3 text-white" /></div>
          <div><label className="block text-sm text-slate-300" htmlFor="recovery-code">Recovery code</label><input id="recovery-code" autoComplete="one-time-code" required value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value)} className="mt-2 w-full rounded bg-slate-800 p-3 font-mono text-white" /></div>
          <div><label className="block text-sm text-slate-300" htmlFor="recovery-password">New password</label><input id="recovery-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded bg-slate-800 p-3 text-white" /></div>
          {error && <p role="alert" className="rounded bg-red-500/10 p-3 text-sm text-red-400">{error}</p>}
          <button disabled={submitting} className="w-full rounded bg-blue-600 py-3 text-white disabled:opacity-50">{submitting ? "Recovering..." : "Recover account"}</button>
        </form>
      )}
      <Link className="mt-5 block text-center text-blue-400 hover:underline" to="/login">Return to login</Link>
    </AuthShell>
  );
}
