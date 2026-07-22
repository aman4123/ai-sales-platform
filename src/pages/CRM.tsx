import { useEffect, useMemo, useState } from "react";
import Layout from "../components/layout/Layout";
import type { Lead } from "../types/lead";
import { getLeads, saveLeads } from "../services/leadStorage";

export default function CRM() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");

  const [company, setCompany] = useState("");
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState("Interested");
  const [value, setValue] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);

  useEffect(() => {
    setLeads(getLeads());
  }, []);

  useEffect(() => {
    saveLeads(leads);
  }, [leads]);

  function clearForm() {
    setCompany("");
    setContact("");
    setStatus("Interested");
    setValue("");
    setEditingId(null);
  }

  function saveLead() {
    if (!company || !contact || !value) return;

    if (editingId !== null) {
      setLeads((prev) =>
        prev.map((lead) =>
          lead.id === editingId
            ? { ...lead, company, contact, status, value }
            : lead
        )
      );
    } else {
      setLeads((prev) => [
        ...prev,
        {
          id: Date.now(),
          company,
          contact,
          status,
          value,
        },
      ]);
    }

    clearForm();
  }

  function editLead(lead: Lead) {
    setEditingId(lead.id);
    setCompany(lead.company);
    setContact(lead.contact);
    setStatus(lead.status);
    setValue(lead.value);
  }

  function deleteLead(id: number) {
    if (!confirm("Delete this lead?")) return;
    setLeads((prev) => prev.filter((lead) => lead.id !== id));
  }

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const matchesSearch =
        lead.company.toLowerCase().includes(search.toLowerCase()) ||
        lead.contact.toLowerCase().includes(search.toLowerCase());

      const matchesFilter =
        filter === "All" || lead.status === filter;

      return matchesSearch && matchesFilter;
    });
  }, [leads, search, filter]);

  const total = leads.length;
  const interested = leads.filter(
    (l) => l.status === "Interested"
  ).length;

  const meetings = leads.filter(
    (l) => l.status === "Meeting"
  ).length;

  const closed = leads.filter(
    (l) => l.status === "Closed"
  ).length;

  function badge(status: string) {
    switch (status) {
      case "Interested":
        return "bg-green-500/20 text-green-400";
      case "Meeting":
        return "bg-blue-500/20 text-blue-400";
      case "Follow Up":
        return "bg-yellow-500/20 text-yellow-400";
      case "Proposal Sent":
        return "bg-purple-500/20 text-purple-400";
      default:
        return "bg-red-500/20 text-red-400";
    }
  }

  return (
    <Layout>
            <h1 className="text-4xl font-bold">CRM</h1>
      <p className="mt-2 text-slate-400">
        Manage your sales pipeline
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-4">
        <div className="rounded-xl bg-slate-900 p-5">
          <p className="text-slate-400">Total Leads</p>
          <h2 className="mt-2 text-3xl font-bold">{total}</h2>
        </div>

        <div className="rounded-xl bg-slate-900 p-5">
          <p className="text-slate-400">Interested</p>
          <h2 className="mt-2 text-3xl font-bold text-green-400">
            {interested}
          </h2>
        </div>

        <div className="rounded-xl bg-slate-900 p-5">
          <p className="text-slate-400">Meetings</p>
          <h2 className="mt-2 text-3xl font-bold text-blue-400">
            {meetings}
          </h2>
        </div>

        <div className="rounded-xl bg-slate-900 p-5">
          <p className="text-slate-400">Closed</p>
          <h2 className="mt-2 text-3xl font-bold text-purple-400">
            {closed}
          </h2>
        </div>
      </div>

      <div className="mt-8 rounded-xl bg-slate-900 p-6">
        <h2 className="mb-5 text-xl font-semibold">
          {editingId ? "Edit Lead" : "Add New Lead"}
        </h2>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <input
            placeholder="Company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            className="rounded-lg bg-slate-800 p-3 outline-none"
          />

          <input
            placeholder="Contact"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            className="rounded-lg bg-slate-800 p-3 outline-none"
          />

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg bg-slate-800 p-3"
          >
            <option>Interested</option>
            <option>Meeting</option>
            <option>Follow Up</option>
            <option>Proposal Sent</option>
            <option>Closed</option>
          </select>

          <input
            placeholder="Deal Value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="rounded-lg bg-slate-800 p-3 outline-none"
          />
        </div>

        <div className="mt-5 flex gap-3">
          <button
            onClick={saveLead}
            className="rounded-lg bg-blue-600 px-6 py-3 hover:bg-blue-700"
          >
            {editingId ? "Update Lead" : "+ Add Lead"}
          </button>

          {editingId && (
            <button
              onClick={clearForm}
              className="rounded-lg bg-slate-700 px-6 py-3 hover:bg-slate-600"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-4 md:flex-row">
        <input
          placeholder="Search company or contact..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded-lg bg-slate-900 p-4 outline-none"
        />

        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-lg bg-slate-900 px-4"
        >
          <option>All</option>
          <option>Interested</option>
          <option>Meeting</option>
          <option>Follow Up</option>
          <option>Proposal Sent</option>
          <option>Closed</option>
        </select>
      </div>

      <div className="mt-8 overflow-hidden rounded-xl bg-slate-900">
        <table className="w-full">
          <thead className="bg-slate-800">
            <tr>
              <th className="p-4 text-left">Company</th>
              <th className="p-4 text-left">Contact</th>
              <th className="p-4 text-left">Status</th>
              <th className="p-4 text-left">Value</th>
              <th className="p-4 text-center">Actions</th>
            </tr>
          </thead>

          <tbody>
            {filteredLeads.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="p-8 text-center text-slate-400"
                >
                  No leads found.
                </td>
              </tr>
            )}

            {filteredLeads.map((lead) => (
              <tr
                key={lead.id}
                className="border-t border-slate-800 hover:bg-slate-800"
              >
                <td className="p-4">{lead.company}</td>

                <td className="p-4">{lead.contact}</td>

                <td className="p-4">
                  <span
                    className={`rounded-full px-3 py-1 text-sm font-medium ${badge(
                      lead.status
                    )}`}
                  >
                    {lead.status}
                  </span>
                </td>

                <td className="p-4 font-semibold">
                  {lead.value}
                </td>

                <td className="p-4">
                  <div className="flex justify-center gap-2">
                    <button
                      onClick={() => editLead(lead)}
                      className="rounded bg-blue-600 px-4 py-2 hover:bg-blue-700"
                    >
                      Edit
                    </button>

                    <button
                      onClick={() => deleteLead(lead.id)}
                      className="rounded bg-red-600 px-4 py-2 hover:bg-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}