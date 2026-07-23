import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthShell from "../components/auth/AuthShell";
import { useAuth } from "../contexts/auth-context";
import { api, apiErrorMessage } from "../services/api";
import type { VerificationPayload } from "../types/api";

export default function VerifyEmail() {
  const [parameters] = useSearchParams();
  const navigate = useNavigate();
  const { acceptSession } = useAuth();
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const token = parameters.get("token") ?? "";

  async function verify() {
    setSubmitting(true);
    setError("");
    try {
      const response = await api.post<{ data: VerificationPayload }>("/auth/verify-email", { token });
      acceptSession(response.data.data);
      setCodes(response.data.data.recoveryCodes);
      navigate("/verify-email", { replace: true });
    } catch (requestError) {
      setError(apiErrorMessage(requestError, "Email verification failed."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title={codes.length ? "Email verified" : "Verify your email"}>
      {codes.length ? (
        <>
          <p className="mt-5 text-slate-300">Save these one-time recovery codes now. They will not be shown again.</p>
          <ul className="mt-4 grid grid-cols-2 gap-2 rounded bg-slate-950 p-4 font-mono text-sm text-slate-200" aria-label="Recovery codes">
            {codes.map((code) => <li key={code}>{code}</li>)}
          </ul>
          <Link className="mt-6 block rounded bg-blue-600 py-3 text-center text-white" to="/dashboard">Continue to dashboard</Link>
        </>
      ) : (
        <>
          <p className="mt-5 text-slate-300">Confirm this email verification request to activate your account.</p>
          {error && <p role="alert" className="mt-4 rounded bg-red-500/10 p-3 text-sm text-red-400">{error}</p>}
          <button type="button" onClick={() => void verify()} disabled={!token || submitting} className="mt-6 w-full rounded bg-blue-600 py-3 text-white disabled:opacity-50">
            {submitting ? "Verifying..." : "Verify email"}
          </button>
          {!token && <p role="alert" className="mt-4 text-sm text-red-400">This verification link is missing its token.</p>}
        </>
      )}
    </AuthShell>
  );
}
