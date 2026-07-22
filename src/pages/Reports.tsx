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

const monthly = [
  { month: "Jan", leads: 22 },
  { month: "Feb", leads: 35 },
  { month: "Mar", leads: 41 },
  { month: "Apr", leads: 53 },
  { month: "May", leads: 67 },
  { month: "Jun", leads: 82 },
];

const status = [
  { name: "Interested", value: 28 },
  { name: "Meeting", value: 16 },
  { name: "Follow Up", value: 12 },
  { name: "Closed", value: 9 },
];

const COLORS = [
  "#22c55e",
  "#3b82f6",
  "#f59e0b",
  "#a855f7",
];

export default function Reports() {
  return (
    <Layout>

      <h1 className="text-4xl font-bold">
        Reports & Analytics
      </h1>

      <p className="mt-2 text-slate-400">
        Monitor sales performance using AI insights.
      </p>

      <div className="mt-8 grid gap-5 md:grid-cols-4">

        <div className="rounded-xl bg-slate-900 p-5">
          <p className="text-slate-400">Revenue</p>
          <h2 className="mt-2 text-3xl font-bold">
            ₹12.4L
          </h2>
        </div>

        <div className="rounded-xl bg-slate-900 p-5">
          <p className="text-slate-400">Leads</p>
          <h2 className="mt-2 text-3xl font-bold">
            264
          </h2>
        </div>

        <div className="rounded-xl bg-slate-900 p-5">
          <p className="text-slate-400">Meetings</p>
          <h2 className="mt-2 text-3xl font-bold">
            43
          </h2>
        </div>

        <div className="rounded-xl bg-slate-900 p-5">
          <p className="text-slate-400">Closed Deals</p>
          <h2 className="mt-2 text-3xl font-bold">
            18
          </h2>
        </div>

      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">

        <div className="rounded-xl bg-slate-900 p-6">

          <h2 className="mb-6 text-xl font-semibold">
            Monthly Leads
          </h2>

          <ResponsiveContainer
            width="100%"
            height={320}
          >
            <BarChart data={monthly}>

              <CartesianGrid strokeDasharray="3 3" />

              <XAxis dataKey="month" />

              <YAxis />

              <Tooltip />

              <Bar
                dataKey="leads"
                fill="#2563eb"
                radius={[8, 8, 0, 0]}
              />

            </BarChart>
          </ResponsiveContainer>

        </div>

        <div className="rounded-xl bg-slate-900 p-6">

          <h2 className="mb-6 text-xl font-semibold">
            Lead Status
          </h2>

          <ResponsiveContainer
            width="100%"
            height={320}
          >

            <PieChart>

              <Pie
                data={status}
                dataKey="value"
                outerRadius={120}
                label
              >

                {status.map((_, index) => (
                  <Cell
                    key={index}
                    fill={COLORS[index]}
                  />
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