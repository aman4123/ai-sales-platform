import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/layout/Layout";

export default function Profile() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [provider, setProvider] = useState("");
  const [theme, setTheme] = useState("");
  const [notifications, setNotifications] = useState(true);

  useEffect(() => {
    setName(localStorage.getItem("userName") || "Aman Chourasia");
    setCompany(localStorage.getItem("company") || "Not Set");
    setEmail(localStorage.getItem("email") || "Not Set");
    setProvider(localStorage.getItem("provider") || "Mock AI");
    setTheme(localStorage.getItem("theme") || "Dark");
    setNotifications(localStorage.getItem("notifications") !== "false");
  }, []);

  return (
    <Layout>
      <h1 className="text-4xl font-bold">My Profile</h1>

      <p className="mt-2 text-slate-400">
        View your account information.
      </p>

      <div className="mt-8 rounded-xl bg-slate-900 p-8">

        <div className="flex flex-col items-center">

          <div className="flex h-28 w-28 items-center justify-center rounded-full bg-blue-600 text-5xl font-bold">
            {name.charAt(0).toUpperCase()}
          </div>

          <h2 className="mt-4 text-3xl font-bold">
            {name}
          </h2>

          <p className="text-slate-400">
            Administrator
          </p>

        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-2">

          <div className="rounded-lg bg-slate-800 p-5">
            <p className="text-slate-400">Company</p>
            <h3 className="mt-2 text-xl">{company}</h3>
          </div>

          <div className="rounded-lg bg-slate-800 p-5">
            <p className="text-slate-400">Business Email</p>
            <h3 className="mt-2 text-xl">{email}</h3>
          </div>

          <div className="rounded-lg bg-slate-800 p-5">
            <p className="text-slate-400">AI Provider</p>
            <h3 className="mt-2 text-xl">{provider}</h3>
          </div>

          <div className="rounded-lg bg-slate-800 p-5">
            <p className="text-slate-400">Theme</p>
            <h3 className="mt-2 text-xl">{theme}</h3>
          </div>

          <div className="rounded-lg bg-slate-800 p-5 md:col-span-2">
            <p className="text-slate-400">Notifications</p>
            <h3 className="mt-2 text-xl">
              {notifications ? "Enabled" : "Disabled"}
            </h3>
          </div>

        </div>

        <button
          onClick={() => navigate("/settings")}
          className="mt-10 rounded-lg bg-blue-600 px-8 py-4 hover:bg-blue-700"
        >
          Edit Profile
        </button>

      </div>
    </Layout>
  );
}