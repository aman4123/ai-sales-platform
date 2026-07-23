import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthShell from "../components/auth/AuthShell";
import { api, apiErrorMessage } from "../services/api";

export default function ResetPassword() {
  const [parameters] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const token = parameters.get("token") ?? "";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await api.post("/auth/password-reset/confirm", { token, password });
      setComplete(true);
      navigate("/reset-password", { replace: true });
    } catch (requestError) {
      setError(apiErrorMessage(requestError, "Could not reset the password."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title={complete ? "Password changed" : "Choose a new password"}>
      {complete ? (
        <><p role="status" className="mt-6 text-slate-300">Your password was changed and existing sessions were signed out.</p><Link className="mt-6 block rounded bg-blue-600 py-3 text-center text-white" to="/login">Sign in</Link></>
      ) : (
        <form onSubmit={submit}>
          <label className="mt-6 block text-sm text-slate-300" htmlFor="new-password">New password</label>
          <input id="new-password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded bg-slate-800 p-3 text-white" />
          {error && <p role="alert" className="mt-4 rounded bg-red-500/10 p-3 text-sm text-red-400">{error}</p>}
          <button disabled={!token || submitting} className="mt-6 w-full rounded bg-blue-600 py-3 text-white disabled:opacity-50">{submitting ? "Saving..." : "Change password"}</button>
          {!token && <p role="alert" className="mt-4 text-sm text-red-400">This reset link is missing its token.</p>}
        </form>
      )}
    </AuthShell>
  );
}
