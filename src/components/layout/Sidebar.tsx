import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Search,
  Users,
  Mail,
  BarChart3,
  Settings,
  LogOut,
} from "lucide-react";
import { useAuth } from "../../contexts/auth-context";

const menu = [
  {
    name: "Dashboard",
    icon: LayoutDashboard,
    path: "/dashboard",
  },
  {
    name: "Research",
    icon: Search,
    path: "/research",
  },
  {
    name: "CRM",
    icon: Users,
    path: "/crm",
  },
  {
    name: "Email",
    icon: Mail,
    path: "/email",
  },
  {
    name: "Reports",
    icon: BarChart3,
    path: "/reports",
  },
  {
    name: "Settings",
    icon: Settings,
    path: "/settings",
  },
];

export default function Sidebar() {
  const location = useLocation();
  const { user, logout } = useAuth();

  return (
    <aside className="flex h-screen w-72 flex-col border-r border-slate-800 bg-slate-900">

      <div className="border-b border-slate-800 p-8">

        <h1 className="text-3xl font-bold text-blue-500">
          AI Sales
        </h1>

        <p className="mt-2 text-sm text-slate-400">
          Sales Automation Platform
        </p>

      </div>

      <nav className="flex-1 space-y-2 p-5">

        {menu.map((item) => {
          const Icon = item.icon;

          const active = location.pathname === item.path;

          return (
            <Link
              key={item.name}
              to={item.path}
              className={`flex items-center gap-3 rounded-xl px-5 py-4 transition
                ${
                  active
                    ? "bg-blue-600 text-white"
                    : "hover:bg-slate-800"
                }`}
            >
              <Icon size={20} />
              {item.name}
            </Link>
          );
        })}

      </nav>

      <div className="border-t border-slate-800 p-6">

        <button
          onClick={() => void logout()}
          className="mb-4 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-slate-300 transition hover:bg-slate-800"
        >
          <LogOut size={19} />
          Logout
        </button>

        <div className="rounded-xl bg-slate-800 p-4">

          <p className="text-sm text-slate-400">
            AI Provider
          </p>

          <h3 className="mt-1 font-semibold">
            {user?.settings.aiProvider === "DEEPSEEK" ? "DeepSeek" : "Mock AI"}
          </h3>

        </div>

      </div>

    </aside>
  );
}
