import { Bell, Search, UserCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";

export default function Navbar() {
  const navigate = useNavigate();

  const [name, setName] = useState("Aman Chourasia");

  useEffect(() => {
    setName(localStorage.getItem("userName") || "Aman Chourasia");
  }, []);

  return (
    <header className="flex h-20 items-center justify-between border-b border-slate-800 bg-slate-950 px-8">

      <div className="relative w-[420px]">

        <Search
          size={18}
          className="absolute left-4 top-4 text-slate-400"
        />

        <input
          placeholder="Search..."
          className="w-full rounded-lg bg-slate-900 py-3 pl-11 pr-4 outline-none"
        />

      </div>

      <div className="flex items-center gap-6">

        <button className="relative">

          <Bell size={22} />

          <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-red-500"></span>

        </button>

        <button
          onClick={() => navigate("/profile")}
          className="flex items-center gap-3 rounded-lg bg-slate-900 px-4 py-2 transition hover:bg-slate-800"
        >

          <UserCircle size={36} />

          <div className="text-left">

            <p className="font-semibold">
              {name}
            </p>

            <p className="text-sm text-slate-400">
              Admin
            </p>

          </div>

        </button>

      </div>

    </header>
  );
}