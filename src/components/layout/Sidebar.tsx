import { Link, useLocation } from "react-router";
import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  Bot,
  ClipboardList,
  Command,
  ContactRound,
  LayoutDashboard,
  LogOut,
  Mail,
  Megaphone,
  MessageSquareReply,
  Search,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "../../contexts/auth-context";

const menu = [
  { name: "Overview", icon: LayoutDashboard, path: "/dashboard" },
  { name: "Command Center", icon: Command, path: "/command" },
  { name: "Research", icon: Search, path: "/research" },
  { name: "Leads", icon: ContactRound, path: "/leads" },
  { name: "CRM", icon: Users, path: "/crm" },
  { name: "Campaigns", icon: Megaphone, path: "/campaigns" },
  { name: "Inbox", icon: MessageSquareReply, path: "/inbox" },
  { name: "Tasks", icon: ClipboardList, path: "/tasks" },
  { name: "Analytics", icon: BarChart3, path: "/analytics" },
  { name: "Email Studio", icon: Mail, path: "/email" },
  { name: "Settings", icon: Settings, path: "/settings" },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const location = useLocation();
  const { user, logout } = useAuth();
  const sidebarRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [desktop, setDesktop] = useState(
    () => typeof window !== "undefined"
      && typeof window.matchMedia === "function"
      && window.matchMedia("(min-width: 64rem)").matches,
  );
  const visible = open || desktop;
  const navigationItems = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN"
    ? [...menu, { name: "Admin", icon: ShieldCheck, path: "/admin" }]
    : menu;

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(min-width: 64rem)");
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!open || desktop) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        sidebarRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyboard);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyboard);
    };
  }, [desktop, onClose, open]);

  return (
    <>
      {open && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={onClose}
          aria-label="Close navigation"
        />
      )}
      <aside
        ref={sidebarRef}
        aria-hidden={visible ? undefined : true}
        inert={visible ? undefined : true}
        className={`fixed inset-y-0 left-0 z-50 flex h-dvh w-72 flex-col border-r border-white/10 bg-[#0a141e] shadow-2xl shadow-black/30 transition-transform lg:sticky lg:top-0 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Primary navigation"
      >
        <div className="flex items-start justify-between border-b border-white/10 p-6">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-300 font-black text-slate-950">AS</span>
            <div>
              <h1 className="font-bold tracking-tight text-white">AI Sales Platform</h1>
              <p className="mt-0.5 text-xs text-slate-400">Human-approved sales OS</p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-white/5 lg:hidden"
            aria-label="Close navigation"
          >
            <X size={22} aria-hidden="true" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-4" aria-label="Main menu">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.path;

            return (
              <Link
                key={item.name}
                to={item.path}
                onClick={onClose}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${
                  active ? "bg-cyan-300 text-slate-950 shadow-lg shadow-cyan-950/30" : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon size={20} aria-hidden="true" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-5">
          <button
            type="button"
            onClick={() => void logout()}
            className="mb-4 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-slate-300 transition hover:bg-white/5 hover:text-white"
          >
            <LogOut size={19} aria-hidden="true" />
            Logout
          </button>

          <div className="rounded-xl border border-white/10 bg-white/[.035] p-4">
            <p className="flex items-center gap-2 text-sm text-slate-400"><Bot size={15} /> AI provider</p>
            <p className="mt-1 font-semibold">
              {user?.settings.aiProvider === "GROQ" ? "Groq · approval gated" : "Mock AI · no live claims"}
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
