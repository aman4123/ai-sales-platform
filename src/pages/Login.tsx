import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import AuthShell from "../components/auth/AuthShell";
import { useAuth } from "../contexts/auth-context";
import { apiErrorMessage } from "../services/api";
import type { RegistrationPayload } from "../types/api";

interface LoginProps {
  mode: "login" | "register";
}

export default function Login({ mode }: LoginProps) {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const isRegister = mode === "register";
  const locationState = location.state as {
    from?: { pathname?: string };
    registration?: RegistrationPayload;
  } | null;
  const registration = !isRegister ? locationState?.registration ?? null : null;

  if (user) return <Navigate to="/dashboard" replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      if (isRegister) {
        const result = await register(name, email, password);
        navigate("/login", { replace: true, state: { registration: result } });
        return;
      }
      await login(email, password);

      const from = locationState?.from?.pathname;
      navigate(from || "/dashboard", { replace: true });
    } catch (requestError) {
      setError(apiErrorMessage(requestError, "Authentication failed."));
    } finally {
      setSubmitting(false);
    }
  }

  const verificationPath = registration?.developmentVerificationToken
    ? `/verify-email?token=${encodeURIComponent(registration.developmentVerificationToken)}`
    : null;

  return (
    <AuthShell title={isRegister ? "Create Account" : "Login"}>
      <form onSubmit={submit}>

        {registration && (
          <div role="status" className="mt-6 rounded-xl border border-emerald-300/20 bg-emerald-300/[.06] p-4 text-sm leading-6 text-emerald-100">
            Account created for <strong>{registration.email}</strong>. Check your email, verify the address, then sign in here.
            {verificationPath && (
              <Link className="mt-3 block font-semibold text-cyan-300 hover:text-cyan-200" to={verificationPath}>
                Open development verification link
              </Link>
            )}
          </div>
        )}

        {isRegister && (
          <div className="mt-6">
            <label className="sr-only" htmlFor="auth-name">Full name</label>
            <input
              id="auth-name"
              className="w-full rounded-xl border border-white/10 bg-white/[.04] p-3.5 text-white placeholder:text-slate-500 focus:border-cyan-300/50 focus:outline-none"
              placeholder="Full Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              minLength={2}
              maxLength={100}
              required
            />
          </div>
        )}

        <label className="sr-only" htmlFor="auth-email">Email address</label>
        <input
          id="auth-email"
          type="email"
          className={`w-full ${isRegister || registration ? "mt-4" : "mt-6"} rounded-xl border border-white/10 bg-white/[.04] p-3.5 text-white placeholder:text-slate-500 focus:border-cyan-300/50 focus:outline-none`}
          placeholder="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          maxLength={254}
          required
        />

        <label className="sr-only" htmlFor="auth-password">Password</label>
        <input
          id="auth-password"
          type="password"
          className="mt-4 w-full rounded-xl border border-white/10 bg-white/[.04] p-3.5 text-white placeholder:text-slate-500 focus:border-cyan-300/50 focus:outline-none"
          placeholder="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete={isRegister ? "new-password" : "current-password"}
          minLength={isRegister ? 12 : 1}
          maxLength={128}
          required
        />

        {error && (
          <p role="alert" className="mt-4 rounded bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-6 block w-full rounded-xl bg-cyan-300 py-3.5 text-center font-bold text-slate-950 transition hover:bg-cyan-200 disabled:opacity-50"
        >
          {submitting ? "Please wait..." : isRegister ? "Register" : "Login"}
        </button>

        <p className="mt-5 text-center text-sm text-slate-400">
          {isRegister ? "Already have an account?" : "New to AI Sales?"}{" "}
          <Link className="font-semibold text-cyan-300 hover:text-cyan-200" to={isRegister ? "/login" : "/register"}>
            {isRegister ? "Login" : "Register"}
          </Link>
        </p>
        {!isRegister && (
          <div className="mt-4 flex flex-wrap justify-center gap-4 text-sm">
            <Link className="text-cyan-300 hover:text-cyan-200" to="/forgot-password">Forgot password?</Link>
            <Link className="text-cyan-300 hover:text-cyan-200" to="/recover-account">Use recovery code</Link>
            <Link className="text-cyan-300 hover:text-cyan-200" to="/resend-verification">Resend verification</Link>
          </div>
        )}
      </form>
    </AuthShell>
  );
}
