import { useNavigate } from "react-router-dom";
import Layout from "../components/layout/Layout";
import { useAuth } from "../contexts/auth-context";

export default function Profile() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const settings = user!.settings;

  return (
    <Layout>
      <h1 className="text-4xl font-bold">My Profile</h1>
      <p className="mt-2 text-slate-400">View your account information.</p>
      <div className="mt-8 rounded-xl bg-slate-900 p-8">
        <div className="flex flex-col items-center">
          <div className="flex h-28 w-28 items-center justify-center rounded-full bg-blue-600 text-5xl font-bold">
            {user!.name.charAt(0).toUpperCase()}
          </div>
          <h2 className="mt-4 text-3xl font-bold">{user!.name}</h2>
          <p className="text-slate-400">{user!.role === "ADMIN" ? "Administrator" : "Member"}</p>
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <div className="rounded-lg bg-slate-800 p-5"><p className="text-slate-400">Company</p><h3 className="mt-2 text-xl">{settings.company || "Not Set"}</h3></div>
          <div className="rounded-lg bg-slate-800 p-5"><p className="text-slate-400">Business Email</p><h3 className="mt-2 text-xl">{user!.email}</h3></div>
          <div className="rounded-lg bg-slate-800 p-5"><p className="text-slate-400">AI Provider</p><h3 className="mt-2 text-xl">{settings.aiProvider === "DEEPSEEK" ? "DeepSeek" : "Mock AI"}</h3></div>
          <div className="rounded-lg bg-slate-800 p-5"><p className="text-slate-400">Theme</p><h3 className="mt-2 text-xl">{settings.theme[0] + settings.theme.slice(1).toLowerCase()}</h3></div>
          <div className="rounded-lg bg-slate-800 p-5 md:col-span-2"><p className="text-slate-400">Notifications</p><h3 className="mt-2 text-xl">{settings.notifications ? "Enabled" : "Disabled"}</h3></div>
        </div>
        <button onClick={() => navigate("/settings")} className="mt-10 rounded-lg bg-blue-600 px-8 py-4 hover:bg-blue-700">Edit Profile</button>
      </div>
    </Layout>
  );
}
