import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
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
  const [registration, setRegistration] = useState<RegistrationPayload | null>(null);
  const isRegister = mode === "register";

  if (user) return <Navigate to="/dashboard" replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      if (isRegister) {
        setRegistration(await register(name, email, password));
        return;
      }
      await login(email, password);

      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      navigate(from || "/dashboard", { replace: true });
    } catch (requestError) {
      setError(apiErrorMessage(requestError, "Authentication failed."));
    } finally {
      setSubmitting(false);
    }
  }

  if (registration) {
    const verificationPath = registration.developmentVerificationToken
      ? `/verify-email?token=${encodeURIComponent(registration.developmentVerificationToken)}`
      : null;
    return (
      <AuthShell title="Check your email">
        <p role="status" className="mt-6 text-slate-300">
          We sent a verification link to <strong>{registration.email}</strong>. Verify the address before signing in.
        </p>
        {verificationPath && (
          <Link className="mt-6 block rounded bg-blue-600 py-3 text-center text-white" to={verificationPath}>
            Open development verification link
          </Link>
        )}
        <Link className="mt-5 block text-center text-blue-400 hover:underline" to="/login">
          Return to login
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={isRegister ? "Create Account" : "Login"}>
      <form onSubmit={submit}>

        {isRegister && (
          <div className="mt-6">
            <label className="sr-only" htmlFor="auth-name">Full name</label>
            <input
              id="auth-name"
              className="w-full rounded bg-slate-800 p-3 text-white"
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
          className={`w-full ${isRegister ? "mt-4" : "mt-6"} p-3 rounded bg-slate-800 text-white`}
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
          className="w-full mt-4 p-3 rounded bg-slate-800 text-white"
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
          className="block w-full text-center mt-6 bg-blue-600 py-3 rounded text-white disabled:opacity-50"
        >
          {submitting ? "Please wait..." : isRegister ? "Register" : "Login"}
        </button>

        <p className="mt-5 text-center text-sm text-slate-400">
          {isRegister ? "Already have an account?" : "New to AI Sales?"}{" "}
          <Link className="text-blue-400 hover:underline" to={isRegister ? "/login" : "/register"}>
            {isRegister ? "Login" : "Register"}
          </Link>
        </p>
        {!isRegister && (
          <div className="mt-4 flex flex-wrap justify-center gap-4 text-sm">
            <Link className="text-blue-400 hover:underline" to="/forgot-password">Forgot password?</Link>
            <Link className="text-blue-400 hover:underline" to="/recover-account">Use recovery code</Link>
            <Link className="text-blue-400 hover:underline" to="/resend-verification">Resend verification</Link>
          </div>
        )}
      </form>
    </AuthShell>
  );
}
