import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, apiErrorMessage } from "../../services/api";
import AuthShell from "./AuthShell";

interface AccountEmailRequestProps {
  title: string;
  endpoint: string;
  buttonLabel: string;
  developmentTokenKey: "developmentResetToken" | "developmentVerificationToken";
  developmentPath: "/reset-password" | "/verify-email";
}

export default function AccountEmailRequest(props: AccountEmailRequestProps) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [developmentToken, setDevelopmentToken] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await api.post<{ data: Record<string, string | undefined> }>(
        props.endpoint,
        { email },
      );
      setMessage(response.data.data.message ?? "If an eligible account exists, an email will arrive shortly.");
      setDevelopmentToken(response.data.data[props.developmentTokenKey] ?? "");
    } catch (requestError) {
      setError(apiErrorMessage(requestError, "Could not send the account email."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title={props.title}>
      {message ? (
        <>
          <p role="status" className="mt-6 text-slate-300">{message}</p>
          {developmentToken && (
            <Link className="mt-6 block rounded bg-blue-600 py-3 text-center text-white" to={`${props.developmentPath}?token=${encodeURIComponent(developmentToken)}`}>
              Open development link
            </Link>
          )}
        </>
      ) : (
        <form onSubmit={submit}>
          <label className="mt-6 block text-sm text-slate-300" htmlFor="account-email">Email address</label>
          <input id="account-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded bg-slate-800 p-3 text-white" />
          {error && <p role="alert" className="mt-4 rounded bg-red-500/10 p-3 text-sm text-red-400">{error}</p>}
          <button disabled={submitting} className="mt-6 w-full rounded bg-blue-600 py-3 text-white disabled:opacity-50">{submitting ? "Sending..." : props.buttonLabel}</button>
        </form>
      )}
      <Link className="mt-5 block text-center text-blue-400 hover:underline" to="/login">Return to login</Link>
    </AuthShell>
  );
}
