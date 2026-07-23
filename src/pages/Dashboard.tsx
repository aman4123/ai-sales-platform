import Layout from "../components/layout/Layout";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import type { Lead } from "../types/lead";
import { getLeadPage } from "../services/leadStorage";
import { getReports } from "../services/reports";
import { apiErrorMessage } from "../services/api";
import type { ReportData } from "../types/api";

const emptyReports: ReportData = {
  summary: { revenue: 0, leads: 0, meetings: 0, closedDeals: 0 },
  monthly: [],
  status: [],
};

export default function Dashboard() {
  const navigate = useNavigate();

  const [recentLeads, setRecentLeads] = useState<Lead[]>([]);
  const [reports, setReports] = useState<ReportData>(emptyReports);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([getLeadPage({ limit: 5, signal: controller.signal }), getReports(controller.signal)])
      .then(([leadPage, reportData]) => {
        setRecentLeads(leadPage.leads);
        setReports(reportData);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setRecentLeads([]);
          setReports(emptyReports);
          toast.error(apiErrorMessage(error, "Could not load the dashboard."));
        }
      });
    return () => controller.abort();
  }, []);

  const interested = reports.status.find((entry) => entry.name === "Interested")?.value ?? 0;

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
            {reports.summary.leads}
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
            {reports.summary.meetings}
          </h2>
        </div>

        <div className="rounded-xl bg-slate-900 p-6">
          <p className="text-slate-400">
            Revenue
          </p>

          <h2 className="mt-3 text-4xl font-bold text-purple-400">
            ₹{reports.summary.revenue.toLocaleString()}
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

          {recentLeads.length === 0 ? (
            <p className="text-slate-400">
              No leads added yet.
            </p>
          ) : (
            <div className="space-y-4">

              {recentLeads.map((lead) => (
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
                      {lead.status.replaceAll("_", " ")}
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
