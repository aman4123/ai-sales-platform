import { Bell, Menu, Search, UserCircle } from "lucide-react";
import { useState, type FormEvent, type RefObject } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../../contexts/auth-context";
import AccessModeSwitcher from "./AccessModeSwitcher";

export default function Navbar({
  navigationButtonRef,
  onOpenNavigation,
}: {
  navigationButtonRef: RefObject<HTMLButtonElement | null>;
  onOpenNavigation: () => void;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [query, setQuery] = useState("");

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const search = query.trim();
    navigate(search ? `/crm?q=${encodeURIComponent(search)}` : "/crm");
  }

  return (
    <header className="sticky top-0 z-30 flex h-20 items-center justify-between gap-3 border-b border-white/10 bg-[#071018]/90 px-4 backdrop-blur-xl sm:px-8">
      <button
        ref={navigationButtonRef}
        type="button"
        onClick={onOpenNavigation}
        className="rounded-xl border border-white/10 p-2.5 transition hover:border-white/20 hover:bg-white/5 lg:hidden"
        aria-label="Open navigation"
      >
        <Menu size={24} aria-hidden="true" />
      </button>

      <form className="relative min-w-0 flex-1 sm:max-w-[420px]" onSubmit={submitSearch} role="search">
        <label className="sr-only" htmlFor="global-search">Search CRM</label>
        <Search
          size={18}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
        <input
          id="global-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search CRM..."
          className="w-full rounded-xl border border-white/10 bg-white/[.035] py-3 pl-11 pr-4 text-slate-100 placeholder:text-slate-500 transition focus:border-cyan-300/50 focus:outline-none"
        />
      </form>

      <div className="flex items-center gap-2 sm:gap-3">
        <AccessModeSwitcher />
        <button
          type="button"
          onClick={() => navigate("/settings")}
          className="relative rounded-xl border border-white/10 p-2.5 transition hover:border-white/20 hover:bg-white/5"
          aria-label="Notification settings"
        >
          <Bell size={22} aria-hidden="true" />
          {user?.settings.notifications && (
            <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" aria-hidden="true" />
          )}
        </button>

        <button
          type="button"
          onClick={() => navigate("/profile")}
          className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[.035] px-2 py-2 transition hover:border-cyan-300/20 hover:bg-white/[.06] sm:px-3"
          aria-label="Open profile"
        >
          <UserCircle size={36} aria-hidden="true" />
          <div className="hidden text-left sm:block">
            <p className="max-w-36 truncate font-semibold">{user?.name ?? "Account"}</p>
            <p className="text-sm text-slate-400">
              {user?.accessMode === "MASTER_ADMIN" ? "Master Admin" : user?.accessMode === "TESTER" ? "Tester Mode" : user?.role === "ADMIN" ? "Admin" : "User"}
            </p>
          </div>
        </button>
      </div>
    </header>
  );
}
