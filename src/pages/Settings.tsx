import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import Layout from "../components/layout/Layout";

export default function Settings() {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [signature, setSignature] = useState("");
  const [provider, setProvider] = useState("Mock AI");
  const [theme, setTheme] = useState("Dark");
  const [notifications, setNotifications] = useState(true);

  useEffect(() => {
    setName(localStorage.getItem("userName") || "Aman Chourasia");
    setCompany(localStorage.getItem("company") || "");
    setEmail(localStorage.getItem("email") || "");
    setSignature(localStorage.getItem("signature") || "");
    setProvider(localStorage.getItem("provider") || "Mock AI");
    setTheme(localStorage.getItem("theme") || "Dark");
    setNotifications(
      localStorage.getItem("notifications") !== "false"
    );
  }, []);

  function saveSettings() {
    localStorage.setItem("userName", name);
    localStorage.setItem("company", company);
    localStorage.setItem("email", email);
    localStorage.setItem("signature", signature);
    localStorage.setItem("provider", provider);
    localStorage.setItem("theme", theme);
    localStorage.setItem(
      "notifications",
      notifications.toString()
    );

    toast.success("Settings Saved Successfully!");
  }

  return (
    <Layout>
      <h1 className="text-4xl font-bold">Settings</h1>

      <p className="mt-2 text-slate-400">
        Manage your AI Sales Platform preferences.
      </p>

      <div className="mt-8 space-y-8">

        <div className="rounded-xl bg-slate-900 p-6">
          <h2 className="mb-5 text-2xl font-semibold">
            👤 Profile
          </h2>

          <div className="grid gap-5 md:grid-cols-2">

            <div>
              <label className="mb-2 block text-slate-400">
                Full Name
              </label>

              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg bg-slate-800 p-3 outline-none"
              />
            </div>

            <div>
              <label className="mb-2 block text-slate-400">
                Company
              </label>

              <input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full rounded-lg bg-slate-800 p-3 outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-slate-400">
                Business Email
              </label>

              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg bg-slate-800 p-3 outline-none"
              />
            </div>

          </div>
        </div>

        <div className="rounded-xl bg-slate-900 p-6">
          <h2 className="mb-5 text-2xl font-semibold">
            🤖 AI Settings
          </h2>

          <div className="grid gap-5 md:grid-cols-2">

            <div>
              <label className="mb-2 block text-slate-400">
                AI Provider
              </label>

              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="w-full rounded-lg bg-slate-800 p-3"
              >
                <option>Mock AI</option>
                <option>DeepSeek</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-slate-400">
                Theme
              </label>

              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                className="w-full rounded-lg bg-slate-800 p-3"
              >
                <option>Dark</option>
                <option>Light</option>
                <option>System</option>
              </select>
            </div>

          </div>
        </div>

        <div className="rounded-xl bg-slate-900 p-6">
          <h2 className="mb-5 text-2xl font-semibold">
            📧 Email Settings
          </h2>

          <label className="mb-2 block text-slate-400">
            Default Signature
          </label>

          <textarea
            rows={5}
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            className="w-full rounded-lg bg-slate-800 p-3 outline-none"
          />

          <div className="mt-6 flex items-center justify-between">
            <span>Email Notifications</span>

            <input
              type="checkbox"
              checked={notifications}
              onChange={() => setNotifications(!notifications)}
              className="h-5 w-5"
            />
          </div>

        </div>

        <div className="rounded-xl bg-slate-900 p-6">

          <button
            onClick={saveSettings}
            className="w-full rounded-lg bg-blue-600 py-4 text-lg font-semibold hover:bg-blue-700"
          >
            💾 Save Settings
          </button>

        </div>

      </div>
    </Layout>
  );
}