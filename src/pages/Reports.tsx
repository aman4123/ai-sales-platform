import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import Layout from "../components/layout/Layout";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { apiErrorMessage } from "../services/api";
import { getReports } from "../services/reports";
import type { ReportData } from "../types/api";

const emptyReports: ReportData = {
  summary: { revenue: 0, leads: 0, meetings: 0, closedDeals: 0 },
  monthly: [],
  status: [],
};

const COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#a855f7", "#ef4444"];
const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export default function Reports() {
  const [reports, setReports] = useState<ReportData>(emptyReports);

  useEffect(() => {
    const controller = new AbortController();
    void getReports(controller.signal)
      .then(setReports)
      .catch((error) => {
        if (!controller.signal.aborted) {
          toast.error(apiErrorMessage(error, "Could not load reports."));
        }
      });
    return () => controller.abort();
  }, []);

  return (
    <Layout>
      <h1 className="text-4xl font-bold">Reports & Analytics</h1>
      <p className="mt-2 text-slate-400">Monitor sales performance using AI insights.</p>

      <div className="mt-8 grid gap-5 md:grid-cols-4">
        <div className="rounded-xl bg-slate-900 p-5"><p className="text-slate-400">Revenue</p><h2 className="mt-2 text-3xl font-bold">{currency.format(reports.summary.revenue)}</h2></div>
        <div className="rounded-xl bg-slate-900 p-5"><p className="text-slate-400">Leads</p><h2 className="mt-2 text-3xl font-bold">{reports.summary.leads}</h2></div>
        <div className="rounded-xl bg-slate-900 p-5"><p className="text-slate-400">Meetings</p><h2 className="mt-2 text-3xl font-bold">{reports.summary.meetings}</h2></div>
        <div className="rounded-xl bg-slate-900 p-5"><p className="text-slate-400">Closed Deals</p><h2 className="mt-2 text-3xl font-bold">{reports.summary.closedDeals}</h2></div>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <div
          className="rounded-xl bg-slate-900 p-6"
          role="img"
          aria-label={`Monthly leads: ${reports.monthly.map((entry) => `${entry.month} ${entry.leads}`).join(", ") || "no data"}`}
        >
          <h2 className="mb-6 text-xl font-semibold">Monthly Leads</h2>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={reports.monthly}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="leads" fill="#2563eb" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div
          className="rounded-xl bg-slate-900 p-6"
          role="img"
          aria-label={`Lead status counts: ${reports.status.map((entry) => `${entry.name} ${entry.value}`).join(", ") || "no data"}`}
        >
          <h2 className="mb-6 text-xl font-semibold">Lead Status</h2>
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie data={reports.status} dataKey="value" outerRadius={120} label>
                {reports.status.map((entry, index) => (
                  <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Layout>
  );
}
