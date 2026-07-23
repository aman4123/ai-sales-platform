import { useCallback, useRef, useState, type ReactNode } from "react";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";

type Props = {
  children: ReactNode;
};

export default function Layout({ children }: Props) {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const navigationButtonRef = useRef<HTMLButtonElement>(null);
  const closeNavigation = useCallback(() => {
    setNavigationOpen(false);
    requestAnimationFrame(() => navigationButtonRef.current?.focus());
  }, []);

  return (
    <div className="flex min-h-screen overflow-x-hidden bg-slate-950 text-white">
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
        <main id="main-content" className="p-4 sm:p-8" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
