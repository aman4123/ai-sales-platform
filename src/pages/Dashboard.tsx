import Layout from "../components/layout/Layout";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Lead } from "../types/lead";
import { getLeads } from "../services/leadStorage";

export default function Dashboard() {
  const navigate = useNavigate();

  const [leads, setLeads] = useState<Lead[]>([]);

  useEffect(() => {
    setLeads(getLeads());
  }, []);

  const interested = leads.filter(
    (l) => l.status === "Interested"
  ).length;

  const meetings = leads.filter(
    (l) => l.status === "Meeting"
  ).length;

  // const closed = leads.filter(
  //   (l) => l.status === "Closed"
  // ).length;

  const revenue = leads
    .filter((l) => l.status === "Closed")
    .reduce((sum, lead) => {
      const amount = Number(
        lead.value.replace(/[^\d]/g, "")
      );

      return sum + (isNaN(amount) ? 0 : amount);
    }, 0);

  return (
    <Layout>
      <div className="flex items-center justify-between">

        <div>
          <h1 className="text-4xl font-bold">
            Welcome Back 👋
          </h1>

          <p className="mt-2 text-slate-400">
            Your AI employees are ready to work.
          </p>
        </div>

        <button
          onClick={() => navigate("/crm")}
          className="rounded-lg bg-blue-600 px-6 py-3 hover:bg-blue-700"
        >
          View CRM
        </button>

      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-4">

        <div className="rounded-xl bg-slate-900 p-6">
          <p className="text-slate-400">
            Total Leads
          </p>

          <h2 className="mt-3 text-4xl font-bold">
            {leads.length}
          </h2>
        </div>

        <div className="rounded-xl bg-slate-900 p-6">
          <p className="text-slate-400">
            Interested
          </p>

          <h2 className="mt-3 text-4xl font-bold text-green-400">
            {interested}
          </h2>
        </div>

        <div className="rounded-xl bg-slate-900 p-6">
          <p className="text-slate-400">
            Meetings
          </p>

          <h2 className="mt-3 text-4xl font-bold text-blue-400">
            {meetings}
          </h2>
        </div>

        <div className="rounded-xl bg-slate-900 p-6">
          <p className="text-slate-400">
            Revenue
          </p>

          <h2 className="mt-3 text-4xl font-bold text-purple-400">
            ₹{revenue.toLocaleString()}
          </h2>
        </div>

      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">

        <div className="rounded-xl bg-slate-900 p-6">

          <h2 className="mb-4 text-2xl font-bold">
            Quick Actions
          </h2>

          <div className="grid gap-4">

            <button
              onClick={() => navigate("/research")}
              className="rounded-lg bg-slate-800 p-4 text-left hover:bg-slate-700"
            >
              🔍 AI Research
            </button>

            <button
              onClick={() => navigate("/email")}
              className="rounded-lg bg-slate-800 p-4 text-left hover:bg-slate-700"
            >
              📧 Generate Email
            </button>

            <button
              onClick={() => navigate("/crm")}
              className="rounded-lg bg-slate-800 p-4 text-left hover:bg-slate-700"
            >
              👥 Open CRM
            </button>

            <button
              onClick={() => navigate("/reports")}
              className="rounded-lg bg-slate-800 p-4 text-left hover:bg-slate-700"
            >
              📊 View Reports
            </button>

          </div>

        </div>

        <div className="rounded-xl bg-slate-900 p-6">

          <h2 className="mb-4 text-2xl font-bold">
            Recent Activity
          </h2>

          {leads.length === 0 ? (
            <p className="text-slate-400">
              No leads added yet.
            </p>
          ) : (
            <div className="space-y-4">

              {leads
                .slice(-5)
                .reverse()
                .map((lead) => (
                  <div
                    key={lead.id}
                    className="rounded-lg bg-slate-800 p-4"
                  >
                    <h3 className="font-semibold">
                      {lead.company}
                    </h3>

                    <p className="text-sm text-slate-400">
                      {lead.contact}
                    </p>

                    <span className="mt-2 inline-block rounded-full bg-blue-600/20 px-3 py-1 text-sm text-blue-400">
                      {lead.status}
                    </span>
                  </div>
                ))}

            </div>
          )}

        </div>

      </div>
    </Layout>
  );
}