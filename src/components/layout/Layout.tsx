import { useCallback, useRef, useState, type ReactNode } from "react";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import { useAuth } from "../../contexts/auth-context";

type Props = {
  children: ReactNode;
};

export default function Layout({ children }: Props) {
  const { user } = useAuth();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const navigationButtonRef = useRef<HTMLButtonElement>(null);
  const closeNavigation = useCallback(() => {
    setNavigationOpen(false);
    requestAnimationFrame(() => navigationButtonRef.current?.focus());
  }, []);

  return (
    <div className="flex min-h-screen overflow-x-hidden bg-[#071018] text-slate-100">
      <a
        href="#main-content"
        className="sr-only z-[60] rounded bg-blue-600 px-4 py-2 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to main content
      </a>
      <Sidebar open={navigationOpen} onClose={closeNavigation} />

      <div className="min-w-0 flex-1">
        <Navbar
          navigationButtonRef={navigationButtonRef}
          onOpenNavigation={() => setNavigationOpen(true)}
        />
        {user?.accessMode === "TESTER" && (
          <div className="border-b border-amber-300/15 bg-amber-300/[.06] px-4 py-2 text-center text-xs font-semibold text-amber-100 sm:px-8">
            Tester Mode is active. Demo records stay inside this Master Admin workspace and are clearly labeled.
          </div>
        )}
        <main id="main-content" className="relative p-4 sm:p-8" tabIndex={-1}>
          <div className="pointer-events-none absolute left-1/2 top-0 -z-0 h-72 w-3/4 -translate-x-1/2 rounded-full bg-cyan-400/[.035] blur-3xl" />
          <div className="relative z-10">
          {children}
          </div>
        </main>
      </div>
    </div>
  );
}
