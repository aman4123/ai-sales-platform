import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import toast from "react-hot-toast";
import Layout from "../components/layout/Layout";
import type { Lead, LeadStatus } from "../types/lead";
import { leadStatusLabels, leadStatuses } from "../types/lead";
import {
  createLead,
  getLeadPage,
  removeLead,
  updateLead,
} from "../services/leadStorage";
import { api, apiErrorMessage } from "../services/api";
import { getReports } from "../services/reports";
import type { ReportData } from "../types/api";

const PAGE_SIZE = 50;
const emptyReports: ReportData = {
  summary: { revenue: 0, leads: 0, meetings: 0, closedDeals: 0 },
  monthly: [],
  status: [],
};
const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

interface CompanyRecord {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  confidenceScore: number;
  riskFlags: string[];
  _count: { contacts: number };
}

interface ContactRecord {
  id: string;
  name: string;
  jobTitle: string | null;
  publicEmail: string | null;
  verificationStatus: string;
  company: { id: string; name: string } | null;
}

export default function CRM() {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get("q") ?? "";
  const [leads, setLeads] = useState<Lead[]>([]);
  const [reports, setReports] = useState<ReportData>(emptyReports);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"All" | LeadStatus>("All");
  const [company, setCompany] = useState("");
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState<LeadStatus>("INTERESTED");
  const [value, setValue] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [contactForm, setContactForm] = useState({ companyId: "", name: "", jobTitle: "", publicEmail: "", publicSourceUrl: "" });

  const loadV2Records = useCallback(async (signal?: AbortSignal) => {
    const [companyResponse, contactResponse] = await Promise.all([
      api.get<{ data: { companies: CompanyRecord[] } }>("/crm/companies?limit=100&sort=name", { signal }),
      api.get<{ data: { contacts: ContactRecord[] } }>("/crm/contacts?limit=100&sort=name", { signal }),
    ]);
    return {
      companies: companyResponse.data.data.companies,
      contacts: contactResponse.data.data.contacts,
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadV2Records(controller.signal)
      .then((records) => {
        setCompanies(records.companies);
        setContacts(records.contacts);
      })
      .catch((error) => {
        if (!controller.signal.aborted) toast.error(apiErrorMessage(error, "Could not load companies and contacts."));
      });
    return () => controller.abort();
  }, [loadV2Records, reloadKey]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      void getLeadPage({
        search: search.trim() || undefined,
        status: filter === "All" ? undefined : filter,
        limit: PAGE_SIZE,
        signal: controller.signal,
      })
        .then((page) => {
          setLeads(page.leads);
          setTotal(page.total);
          setNextCursor(page.nextCursor);
        })
        .catch((error) => {
          if (!controller.signal.aborted) {
            toast.error(apiErrorMessage(error, "Could not load leads."));
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [filter, reloadKey, search]);

  useEffect(() => {
    const controller = new AbortController();
    void getReports(controller.signal)
      .then(setReports)
      .catch((error) => {
        if (!controller.signal.aborted) {
          toast.error(apiErrorMessage(error, "Could not load CRM totals."));
        }
      });
    return () => controller.abort();
  }, [reloadKey]);

  function clearForm() {
    setCompany("");
    setContact("");
    setStatus("INTERESTED");
    setValue("");
    setEditingId(null);
  }

  async function saveLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
        await updateLead(editingId, input);
        toast.success("Lead updated.");
      } else {
        await createLead(input);
        toast.success("Lead added.");
      }
      clearForm();
      setReloadKey((value) => value + 1);
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
    document.getElementById("lead-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function deleteLead(id: string) {
    if (!window.confirm("Delete this lead?")) return;
    try {
      await removeLead(id);
      toast.success("Lead deleted.");
      setReloadKey((value) => value + 1);
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not delete the lead."));
    }
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await getLeadPage({
        search: search.trim() || undefined,
        status: filter === "All" ? undefined : filter,
        cursor: nextCursor,
        limit: PAGE_SIZE,
      });
      setLeads((current) => [...current, ...page.leads]);
      setNextCursor(page.nextCursor);
      setTotal(page.total);
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not load more leads."));
    } finally {
      setLoadingMore(false);
    }
  }

  async function createContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.post("/crm/contacts", {
        companyId: contactForm.companyId,
        name: contactForm.name,
        jobTitle: contactForm.jobTitle,
        publicEmail: contactForm.publicEmail,
        publicSourceUrl: contactForm.publicSourceUrl,
        verificationStatus: "PARTIALLY_VERIFIED",
      });
      setContactForm({ companyId: "", name: "", jobTitle: "", publicEmail: "", publicSourceUrl: "" });
      const records = await loadV2Records();
      setCompanies(records.companies);
      setContacts(records.contacts);
      toast.success("Public professional contact added.");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not create the contact."));
    } finally {
      setSaving(false);
    }
  }

  const statusCount = (name: string) =>
    reports.status.find((entry) => entry.name === name)?.value ?? 0;

  function updateSearch(value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set("q", value);
    else next.delete("q");
    setSearchParams(next, { replace: true });
  }

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

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl bg-slate-900 p-5">
          <p className="text-slate-400">Total Leads</p>
          <h2 className="mt-2 text-3xl font-bold">{reports.summary.leads}</h2>
        </div>
        <div className="rounded-xl bg-slate-900 p-5">
          <p className="text-slate-400">Interested</p>
          <h2 className="mt-2 text-3xl font-bold text-green-400">{statusCount("Interested")}</h2>
        </div>
        <div className="rounded-xl bg-slate-900 p-5">
          <p className="text-slate-400">Meetings</p>
          <h2 className="mt-2 text-3xl font-bold text-blue-400">{reports.summary.meetings}</h2>
        </div>
        <div className="rounded-xl bg-slate-900 p-5">
          <p className="text-slate-400">Closed</p>
          <h2 className="mt-2 text-3xl font-bold text-purple-400">{reports.summary.closedDeals}</h2>
        </div>
      </div>

      <section className="mt-8 rounded-xl border border-slate-800 bg-slate-900 p-6" aria-labelledby="verified-crm-heading">
        <h2 id="verified-crm-heading" className="text-xl font-semibold">Researched companies and public contacts</h2>
        <p className="mt-2 text-sm text-slate-400">Research evidence and public contact sources remain visible; unknown fields stay empty.</p>
        <div className="mt-5 grid gap-6 xl:grid-cols-2">
          <div>
            <h3 className="font-semibold">Companies</h3>
            <div className="mt-3 space-y-3">{companies.length ? companies.map((record) => <article key={record.id} className="rounded-xl bg-slate-950 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{record.name}</p><span className="text-xs text-cyan-300">Confidence {Math.round(record.confidenceScore)}%</span></div><p className="mt-2 text-sm text-slate-400">{record.domain ?? "Domain not verified"} · {record.industry ?? "Industry not verified"}</p><p className="mt-2 text-xs text-slate-500">{record._count.contacts} public contacts · {record.riskFlags.join(", ") || "No recorded flags"}</p></article>) : <p className="rounded-xl border border-dashed border-slate-700 p-5 text-sm text-slate-500">No researched companies have been saved.</p>}</div>
            <h3 className="mt-6 font-semibold">Contacts</h3>
            <div className="mt-3 space-y-2">{contacts.length ? contacts.map((record) => <p key={record.id} className="rounded-xl bg-slate-950 p-4 text-sm"><span className="font-medium">{record.name}</span> · {record.jobTitle ?? "Title not verified"} · {record.company?.name ?? "No company"}<span className="mt-1 block text-xs text-slate-500">{record.publicEmail ?? "Email not verified"} · {record.verificationStatus.replaceAll("_", " ")}</span></p>) : <p className="text-sm text-slate-500">No public contacts added.</p>}</div>
          </div>
          <form onSubmit={createContact} className="rounded-xl border border-slate-800 p-5">
            <h3 className="font-semibold">Add sourced public contact</h3>
            <div className="mt-4 grid gap-3">
              <label className="text-sm text-slate-300">Saved company<select required value={contactForm.companyId} onChange={(event) => setContactForm({ ...contactForm, companyId: event.target.value })} className="mt-2 w-full rounded-lg bg-slate-950 p-3"><option value="">Select a saved company</option>{companies.map((record) => <option key={record.id} value={record.id}>{record.name}</option>)}</select></label>
              <label className="text-sm text-slate-300">Contact name<input required value={contactForm.name} onChange={(event) => setContactForm({ ...contactForm, name: event.target.value })} className="mt-2 w-full rounded-lg bg-slate-950 p-3" /></label>
              <label className="text-sm text-slate-300">Public job title<input value={contactForm.jobTitle} onChange={(event) => setContactForm({ ...contactForm, jobTitle: event.target.value })} className="mt-2 w-full rounded-lg bg-slate-950 p-3" /></label>
              <label className="text-sm text-slate-300">Public professional email<input type="email" required value={contactForm.publicEmail} onChange={(event) => setContactForm({ ...contactForm, publicEmail: event.target.value })} className="mt-2 w-full rounded-lg bg-slate-950 p-3" /></label>
              <label className="text-sm text-slate-300">Public source URL<input type="url" required value={contactForm.publicSourceUrl} onChange={(event) => setContactForm({ ...contactForm, publicSourceUrl: event.target.value })} className="mt-2 w-full rounded-lg bg-slate-950 p-3" /></label>
            </div>
            <button type="submit" disabled={saving || companies.length === 0} className="mt-4 rounded-lg bg-cyan-300 px-5 py-3 font-semibold text-slate-950 disabled:opacity-40">Add public contact</button>
          </form>
        </div>
      </section>

      <form id="lead-form" className="mt-8 rounded-xl bg-slate-900 p-6" onSubmit={saveLead}>
        <h2 className="mb-5 text-xl font-semibold">{editingId ? "Edit Lead" : "Add New Lead"}</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="sr-only" htmlFor="lead-company">Company</label>
          <input id="lead-company" placeholder="Company" value={company} onChange={(event) => setCompany(event.target.value)} maxLength={160} required className="rounded-lg bg-slate-800 p-3" />
          <label className="sr-only" htmlFor="lead-contact">Contact</label>
          <input id="lead-contact" placeholder="Contact" value={contact} onChange={(event) => setContact(event.target.value)} maxLength={160} required className="rounded-lg bg-slate-800 p-3" />
          <label className="sr-only" htmlFor="lead-status">Status</label>
          <select id="lead-status" value={status} onChange={(event) => setStatus(event.target.value as LeadStatus)} className="rounded-lg bg-slate-800 p-3">
            {leadStatuses.map((item) => <option key={item} value={item}>{leadStatusLabels[item]}</option>)}
          </select>
          <label className="sr-only" htmlFor="lead-value">Deal value</label>
          <input id="lead-value" placeholder="Deal Value" value={value} onChange={(event) => setValue(event.target.value)} inputMode="decimal" required className="rounded-lg bg-slate-800 p-3" />
        </div>
        <div className="mt-5 flex gap-3">
          <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-6 py-3 hover:bg-blue-700 disabled:opacity-50">
            {saving ? "Saving..." : editingId ? "Update Lead" : "+ Add Lead"}
          </button>
          {editingId && <button type="button" onClick={clearForm} className="rounded-lg bg-slate-700 px-6 py-3 hover:bg-slate-600">Cancel</button>}
        </div>
      </form>

      <div className="mt-8 flex flex-col gap-4 md:flex-row">
        <label className="sr-only" htmlFor="lead-search">Search company or contact</label>
        <input id="lead-search" type="search" placeholder="Search company or contact..." value={search} onChange={(event) => updateSearch(event.target.value)} className="flex-1 rounded-lg bg-slate-900 p-4" />
        <label className="sr-only" htmlFor="lead-filter">Filter by status</label>
        <select id="lead-filter" value={filter} onChange={(event) => setFilter(event.target.value as "All" | LeadStatus)} className="rounded-lg bg-slate-900 px-4 py-3">
          <option value="All">All statuses</option>
          {leadStatuses.map((item) => <option key={item} value={item}>{leadStatusLabels[item]}</option>)}
        </select>
      </div>

      <p className="mt-4 text-sm text-slate-400" aria-live="polite">
        {loading ? "Loading leads..." : `Showing ${leads.length} of ${total} matching leads`}
      </p>
      <div className="mt-4 overflow-x-auto rounded-xl bg-slate-900">
        <table className="w-full min-w-[720px]">
          <caption className="sr-only">Sales leads matching the current search and status filter</caption>
          <thead className="bg-slate-800"><tr><th scope="col" className="p-4 text-left">Company</th><th scope="col" className="p-4 text-left">Contact</th><th scope="col" className="p-4 text-left">Status</th><th scope="col" className="p-4 text-left">Value</th><th scope="col" className="p-4 text-center">Actions</th></tr></thead>
          <tbody>
            {(loading || leads.length === 0) && <tr><td colSpan={5} className="p-8 text-center text-slate-400">{loading ? "Loading leads..." : "No leads found."}</td></tr>}
            {!loading && leads.map((lead) => (
              <tr key={lead.id} className="border-t border-slate-800 hover:bg-slate-800">
                <td className="p-4">{lead.company}</td><td className="p-4">{lead.contact}</td>
                <td className="p-4"><span className={`rounded-full px-3 py-1 text-sm font-medium ${badge(lead.status)}`}>{leadStatusLabels[lead.status]}</span></td>
                <td className="p-4 font-semibold">{currency.format(Number(lead.value))}</td>
                <td className="p-4"><div className="flex justify-center gap-2"><button type="button" onClick={() => editLead(lead)} className="rounded bg-blue-600 px-4 py-2 hover:bg-blue-700">Edit</button><button type="button" onClick={() => void deleteLead(lead.id)} className="rounded bg-red-600 px-4 py-2 hover:bg-red-700">Delete</button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {nextCursor && (
        <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="mt-5 w-full rounded-lg bg-slate-800 py-3 hover:bg-slate-700 disabled:opacity-50">
          {loadingMore ? "Loading..." : "Load more leads"}
        </button>
      )}
    </Layout>
  );
}
