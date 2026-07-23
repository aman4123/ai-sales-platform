import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import Layout from "../components/layout/Layout";
import type { Lead, LeadStatus } from "../types/lead";
import { leadStatusLabels, leadStatuses } from "../types/lead";
import { createLead, getLeads, removeLead, updateLead } from "../services/leadStorage";
import { apiErrorMessage } from "../services/api";

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export default function CRM() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"All" | LeadStatus>("All");
  const [company, setCompany] = useState("");
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState<LeadStatus>("INTERESTED");
  const [value, setValue] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    void getLeads()
      .then(setLeads)
      .catch((error) => toast.error(apiErrorMessage(error, "Could not load leads.")))
      .finally(() => setLoading(false));
  }, []);

  function clearForm() {
    setCompany("");
    setContact("");
    setStatus("INTERESTED");
    setValue("");
    setEditingId(null);
  }

  async function saveLead() {
    const numericValue = Number(value.replace(/[₹,\s]/g, ""));
    if (!company.trim() || !contact.trim() || !Number.isFinite(numericValue) || numericValue < 0) {
      toast.error("Enter a company, contact, and valid non-negative deal value.");
      return;
    }

    setSaving(true);
    try {
      const input = {
        company: company.trim(),
        contact: contact.trim(),
        status,
        value: numericValue,
      };
      if (editingId) {
        const updated = await updateLead(editingId, input);
        setLeads((current) => current.map((lead) => (lead.id === editingId ? updated : lead)));
        toast.success("Lead updated.");
      } else {
        const created = await createLead(input);
        setLeads((current) => [created, ...current]);
        toast.success("Lead added.");
      }
      clearForm();
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not save the lead."));
    } finally {
      setSaving(false);
    }
  }

  function editLead(lead: Lead) {
    setEditingId(lead.id);
    setCompany(lead.company);
    setContact(lead.contact);
    setStatus(lead.status);
    setValue(lead.value);
  }

  async function deleteLead(id: string) {
    if (!confirm("Delete this lead?")) return;
    try {
      await removeLead(id);
      setLeads((current) => current.filter((lead) => lead.id !== id));
      toast.success("Lead deleted.");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not delete the lead."));
    }
  }

  const filteredLeads = useMemo(() => {
    const normalizedSearch = search.toLowerCase();
    return leads.filter((lead) => {
      const matchesSearch =
        lead.company.toLowerCase().includes(normalizedSearch) ||
        lead.contact.toLowerCase().includes(normalizedSearch);
      return matchesSearch && (filter === "All" || lead.status === filter);
    });
  }, [leads, search, filter]);

  const count = (leadStatus: LeadStatus) =>
    leads.filter((lead) => lead.status === leadStatus).length;

  function badge(leadStatus: LeadStatus) {
    switch (leadStatus) {
      case "INTERESTED":
        return "bg-green-500/20 text-green-400";
      case "MEETING":
        return "bg-blue-500/20 text-blue-400";
      case "FOLLOW_UP":
        return "bg-yellow-500/20 text-yellow-400";
      case "PROPOSAL_SENT":
        return "bg-purple-500/20 text-purple-400";
      default:
        return "bg-red-500/20 text-red-400";
    }
  }

  return (
    <Layout>
      <h1 className="text-4xl font-bold">CRM</h1>
      <p className="mt-2 text-slate-400">Manage your sales pipeline</p>

      <div className="mt-8 grid gap-4 md:grid-cols-4">
        <div className="rounded-xl bg-slate-900 p-5">
          <p className="text-slate-400">Total Leads</p>
          <h2 className="mt-2 text-3xl font-bold">{leads.length}</h2>
        </div>
        <div className="rounded-xl bg-slate-900 p-5">
          <p className="text-slate-400">Interested</p>
          <h2 className="mt-2 text-3xl font-bold text-green-400">{count("INTERESTED")}</h2>
        </div>
        <div className="rounded-xl bg-slate-900 p-5">
          <p className="text-slate-400">Meetings</p>
          <h2 className="mt-2 text-3xl font-bold text-blue-400">{count("MEETING")}</h2>
        </div>
        <div className="rounded-xl bg-slate-900 p-5">
          <p className="text-slate-400">Closed</p>
          <h2 className="mt-2 text-3xl font-bold text-purple-400">{count("CLOSED")}</h2>
        </div>
      </div>

      <div className="mt-8 rounded-xl bg-slate-900 p-6">
        <h2 className="mb-5 text-xl font-semibold">{editingId ? "Edit Lead" : "Add New Lead"}</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <input placeholder="Company" value={company} onChange={(event) => setCompany(event.target.value)} className="rounded-lg bg-slate-800 p-3 outline-none" />
          <input placeholder="Contact" value={contact} onChange={(event) => setContact(event.target.value)} className="rounded-lg bg-slate-800 p-3 outline-none" />
          <select value={status} onChange={(event) => setStatus(event.target.value as LeadStatus)} className="rounded-lg bg-slate-800 p-3">
            {leadStatuses.map((item) => <option key={item} value={item}>{leadStatusLabels[item]}</option>)}
          </select>
          <input placeholder="Deal Value" value={value} onChange={(event) => setValue(event.target.value)} inputMode="decimal" className="rounded-lg bg-slate-800 p-3 outline-none" />
        </div>
        <div className="mt-5 flex gap-3">
          <button onClick={() => void saveLead()} disabled={saving} className="rounded-lg bg-blue-600 px-6 py-3 hover:bg-blue-700 disabled:opacity-50">
            {saving ? "Saving..." : editingId ? "Update Lead" : "+ Add Lead"}
          </button>
          {editingId && <button onClick={clearForm} className="rounded-lg bg-slate-700 px-6 py-3 hover:bg-slate-600">Cancel</button>}
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-4 md:flex-row">
        <input placeholder="Search company or contact..." value={search} onChange={(event) => setSearch(event.target.value)} className="flex-1 rounded-lg bg-slate-900 p-4 outline-none" />
        <select value={filter} onChange={(event) => setFilter(event.target.value as "All" | LeadStatus)} className="rounded-lg bg-slate-900 px-4">
          <option value="All">All</option>
          {leadStatuses.map((item) => <option key={item} value={item}>{leadStatusLabels[item]}</option>)}
        </select>
      </div>

      <div className="mt-8 overflow-hidden rounded-xl bg-slate-900">
        <table className="w-full">
          <thead className="bg-slate-800"><tr><th className="p-4 text-left">Company</th><th className="p-4 text-left">Contact</th><th className="p-4 text-left">Status</th><th className="p-4 text-left">Value</th><th className="p-4 text-center">Actions</th></tr></thead>
          <tbody>
            {(loading || filteredLeads.length === 0) && <tr><td colSpan={5} className="p-8 text-center text-slate-400">{loading ? "Loading leads..." : "No leads found."}</td></tr>}
            {filteredLeads.map((lead) => (
              <tr key={lead.id} className="border-t border-slate-800 hover:bg-slate-800">
                <td className="p-4">{lead.company}</td><td className="p-4">{lead.contact}</td>
                <td className="p-4"><span className={`rounded-full px-3 py-1 text-sm font-medium ${badge(lead.status)}`}>{leadStatusLabels[lead.status]}</span></td>
                <td className="p-4 font-semibold">{currency.format(Number(lead.value))}</td>
                <td className="p-4"><div className="flex justify-center gap-2"><button onClick={() => editLead(lead)} className="rounded bg-blue-600 px-4 py-2 hover:bg-blue-700">Edit</button><button onClick={() => void deleteLead(lead.id)} className="rounded bg-red-600 px-4 py-2 hover:bg-red-700">Delete</button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
