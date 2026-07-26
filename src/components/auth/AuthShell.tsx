import type { ReactNode } from "react";
import { Link } from "react-router";

export default function AuthShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#071018] p-5 text-slate-100">
      <div className="pointer-events-none absolute left-1/2 top-[-12rem] h-[34rem] w-[46rem] -translate-x-1/2 rounded-full bg-cyan-400/10 blur-3xl" />
      <section className="relative w-full max-w-md rounded-[28px] border border-white/10 bg-[#0a141e]/95 p-7 shadow-2xl shadow-cyan-950/30 backdrop-blur-xl sm:p-9" aria-labelledby="auth-title">
        <Link to="/" className="mb-8 inline-flex items-center gap-3 font-semibold tracking-tight text-white">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-300 font-black text-slate-950">AS</span>
          <span>AI Sales Platform</span>
        </Link>
        <p className="text-xs font-bold uppercase tracking-[.2em] text-cyan-300">Secure account access</p>
        <h1 id="auth-title" className="mt-3 text-3xl font-bold tracking-tight text-white">{title}</h1>
        {children}
      </section>
    </main>
  );
}
