import { Bell, Menu, Search, UserCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/auth-context";

export default function Navbar({ onOpenNavigation }: { onOpenNavigation: () => void }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [query, setQuery] = useState("");

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const search = query.trim();
    navigate(search ? `/crm?q=${encodeURIComponent(search)}` : "/crm");
  }

  return (
    <header className="flex h-20 items-center justify-between gap-3 border-b border-slate-800 bg-slate-950 px-4 sm:px-8">
      <button
        type="button"
        onClick={onOpenNavigation}
        className="rounded-lg p-2 hover:bg-slate-800 lg:hidden"
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
          className="w-full rounded-lg bg-slate-900 py-3 pl-11 pr-4"
        />
      </form>

      <div className="flex items-center gap-2 sm:gap-6">
        <button
          type="button"
          onClick={() => navigate("/settings")}
          className="relative rounded-lg p-2 hover:bg-slate-800"
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
          className="flex items-center gap-3 rounded-lg bg-slate-900 px-2 py-2 transition hover:bg-slate-800 sm:px-4"
          aria-label="Open profile"
        >
          <UserCircle size={36} aria-hidden="true" />
          <div className="hidden text-left sm:block">
            <p className="font-semibold">{user?.name ?? "Account"}</p>
            <p className="text-sm text-slate-400">
              {user?.role === "ADMIN" ? "Admin" : "Member"}
            </p>
          </div>
        </button>
      </div>
    </header>
  );
}
