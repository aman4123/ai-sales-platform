import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import { useAuth } from "../../contexts/auth-context";
import {
  getSupportContext,
  setSupportContext,
  type SupportContext,
} from "../../services/api";
import { endSupportSession } from "../../services/v2";

type Props = {
  children: ReactNode;
};

export default function Layout({ children }: Props) {
  const { user } = useAuth();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [support, setSupport] = useState<SupportContext | null>(() => getSupportContext());
  const navigationButtonRef = useRef<HTMLButtonElement>(null);
  const closeNavigation = useCallback(() => {
    setNavigationOpen(false);
    requestAnimationFrame(() => navigationButtonRef.current?.focus());
  }, []);

  useEffect(() => {
    const update = () => setSupport(getSupportContext());
    window.addEventListener("support:changed", update);
    return () => window.removeEventListener("support:changed", update);
  }, []);

  async function exitSupportMode() {
    if (!support) return;
    setSupportContext(null);
    setSupport(null);
    try {
      await endSupportSession(support.sessionId, "Master Admin exited support mode");
    } finally {
      window.location.assign("/admin");
    }
  }

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
            TEST MODE is active. Test records stay inside the isolated test workspace and never enter production metrics.
          </div>
        )}
        {support && (
          <div className="flex flex-col items-center justify-center gap-2 border-b border-violet-300/20 bg-violet-300/[.08] px-4 py-2 text-center text-xs font-semibold text-violet-100 sm:flex-row">
            <span>
              SUPPORT MODE · {support.accessLevel.replace("_", " ")} · Viewing {support.targetUserName} in {support.tenantName}
            </span>
            <button type="button" onClick={() => void exitSupportMode()} className="rounded-md border border-violet-200/30 px-2 py-1 hover:bg-violet-200/10">
              Exit support mode
            </button>
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
