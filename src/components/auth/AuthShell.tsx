import type { ReactNode } from "react";

export default function AuthShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <section className="w-full max-w-96 rounded-xl bg-slate-900 p-8" aria-labelledby="auth-title">
        <h1 id="auth-title" className="text-3xl font-bold text-white">{title}</h1>
        {children}
      </section>
    </main>
  );
}
