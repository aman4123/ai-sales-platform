import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/auth-context";
import { apiErrorMessage } from "../services/api";

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

  if (user) return <Navigate to="/dashboard" replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      if (isRegister) await register(name, email, password);
      else await login(email, password);

      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      navigate(from || "/dashboard", { replace: true });
    } catch (requestError) {
      setError(apiErrorMessage(requestError, "Authentication failed."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <form onSubmit={submit} className="w-full max-w-96 rounded-xl bg-slate-900 p-8">
        <h2 className="text-3xl font-bold text-white">
          {isRegister ? "Create Account" : "Login"}
        </h2>

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
          minLength={isRegister ? 8 : 1}
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
      </form>
    </div>
  );
}
