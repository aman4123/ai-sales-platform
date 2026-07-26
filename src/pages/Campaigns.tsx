import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, FileEdit, PauseCircle, Plus, Send, ShieldCheck, Users, type LucideIcon } from "lucide-react";
import toast from "react-hot-toast";
import Layout from "../components/layout/Layout";
import { api, apiErrorMessage } from "../services/api";
import { getLeadPage } from "../services/leadStorage";
import { createCampaign, getCampaigns, type CampaignSummary } from "../services/v2";
import type { Lead } from "../types/lead";

interface CampaignMessage {
  id: string;
  recipientId: string;
  kind: string;
  status: string;
  subject: string;
  greeting: string;
  body: string;
  cta: string;
  closing: string;
  signature: string;
  factsUsed: { wordCount?: number; averageWordsPerSentence?: number; spamWarnings?: string[] };
}

interface CampaignDetail extends Omit<CampaignSummary, "_count"> {
  recipients: Array<{ id: string; status: string; lead: Lead | null; contact: { name: string } | null }>;
  messages: CampaignMessage[];
  approvals: Array<{ id: string; approvalType: string; contentVersion: number; createdAt: string }>;
}

interface SelectableContact {
  id: string;
  name: string;
  publicEmail: string | null;
  verificationStatus: string;
  company: { name: string } | null;
}

const emptyForm = {
  name: "",
  salesGoal: "",
  productService: "",
  valueProposition: "",
  senderName: "",
  senderEmail: "",
  tone: "Professional" as const,
  dailySendingLimit: 25,
};

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [selected, setSelected] = useState<CampaignDetail | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadIds, setLeadIds] = useState<string[]>([]);
  const [contacts, setContacts] = useState<SelectableContact[]>([]);
  const [contactIds, setContactIds] = useState<string[]>([]);
  const [deliveryMode, setDeliveryMode] = useState<"disabled" | "test" | "live">("disabled");
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [generationConfirmed, setGenerationConfirmed] = useState(false);
  const [launchConfirmed, setLaunchConfirmed] = useState(false);
  const [sendConfirmed, setSendConfirmed] = useState(false);

  async function refreshCampaigns() {
    setCampaigns(await getCampaigns());
  }

  async function openCampaign(id: string) {
    const response = await api.get<{ data: { campaign: CampaignDetail } }>(`/campaigns/${encodeURIComponent(id)}`);
    setSelected(response.data.data.campaign);
  }

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      getCampaigns(controller.signal),
      getLeadPage({ limit: 100, signal: controller.signal }),
      api.get<{ data: { contacts: SelectableContact[] } }>("/crm/contacts?limit=100&sort=name", { signal: controller.signal }),
      api.get<{ data: { providerStatus: { email: { deliveryMode: "disabled" | "test" | "live" } } } }>("/settings", { signal: controller.signal }),
    ])
      .then(([campaignData, leadData, contactResponse, settingsResponse]) => {
        setCampaigns(campaignData);
        setLeads(leadData.leads);
        setContacts(contactResponse.data.data.contacts);
        setDeliveryMode(settingsResponse.data.data.providerStatus.email.deliveryMode);
      })
      .catch((error) => {
        if (!controller.signal.aborted) toast.error(apiErrorMessage(error, "Could not load campaigns."));
      });
    return () => controller.abort();
  }, []);

  async function submitCampaign(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const campaign = await createCampaign({
        name: form.name,
        salesGoal: form.salesGoal,
        productService: form.productService,
        valueProposition: form.valueProposition,
        senderIdentity: { displayName: form.senderName, email: form.senderEmail },
        tone: form.tone,
        dailySendingLimit: form.dailySendingLimit,
      });
      setForm(emptyForm);
      await refreshCampaigns();
      await openCampaign(campaign.id);
      toast.success("Draft campaign created. Nothing has been sent.");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not create the campaign."));
    } finally {
      setBusy(false);
    }
  }

  async function addRecipients() {
    if (!selected || leadIds.length + contactIds.length === 0) return;
    setBusy(true);
    try {
      await api.post(`/campaigns/${selected.id}/recipients`, { leadIds, contactIds });
      await openCampaign(selected.id);
      await refreshCampaigns();
      setLeadIds([]);
      setContactIds([]);
      toast.success("Recipients added. Approval is required again after recipient changes.");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not add recipients."));
    } finally {
      setBusy(false);
    }
  }

  async function generateDrafts() {
    if (!selected || !generationConfirmed) return;
    setBusy(true);
    try {
      const response = await api.post<{ data: { created: number; skipped: unknown[] } }>(
        `/campaigns/${selected.id}/drafts`,
        { confirm: true },
      );
      await openCampaign(selected.id);
      await refreshCampaigns();
      toast.success(`${response.data.data.created} grounded draft(s) prepared for review.`);
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not generate grounded drafts."));
    } finally {
      setBusy(false);
    }
  }

  async function updateMessage(message: CampaignMessage) {
    setBusy(true);
    try {
      await api.put(`/campaigns/messages/${message.id}`, {
        subject: message.subject,
        greeting: message.greeting,
        body: message.body,
        cta: message.cta,
        closing: message.closing,
      });
      if (selected) await openCampaign(selected.id);
      await refreshCampaigns();
      toast.success("Draft updated. Previous approval was invalidated.");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not update the message."));
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!selected) return;
    setBusy(true);
    try {
      await api.post(`/campaigns/${selected.id}/approve`, {
        approved: true,
        approvalType: "INITIAL_ONLY",
      });
      await openCampaign(selected.id);
      await refreshCampaigns();
      toast.success("Current recipients and initial messages approved.");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Campaign approval failed."));
    } finally {
      setBusy(false);
    }
  }

  async function queue() {
    if (!selected || !launchConfirmed) return;
    setBusy(true);
    try {
      await api.post(`/campaigns/${selected.id}/queue`, { confirm: true });
      await openCampaign(selected.id);
      await refreshCampaigns();
      toast.success("Approved messages queued. Sending remains provider-gated.");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not queue the campaign."));
    } finally {
      setBusy(false);
    }
  }

  async function control(action: "pause" | "resume" | "stop" | "send-approved") {
    if (!selected) return;
    if (action === "stop" && !window.confirm("Stop this campaign and cancel every unsent message?")) return;
    setBusy(true);
    try {
      await api.post(`/campaigns/${selected.id}/${action}`, { confirm: true });
      await openCampaign(selected.id);
      await refreshCampaigns();
      toast.success(action === "send-approved" ? "The next approved, due batch was processed." : `Campaign ${action === "pause" ? "paused" : action === "resume" ? "resumed" : "stopped"}.`);
    } catch (error) {
      toast.error(apiErrorMessage(error, `Could not ${action.replace("-approved", "")} the campaign.`));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-7xl">
        <p className="text-sm font-semibold uppercase tracking-[.18em] text-cyan-300">Approval-gated outreach</p>
        <h1 className="mt-2 text-4xl font-bold">Campaigns</h1>
        <p className="mt-3 max-w-3xl text-slate-400">Build recipients, grounded messages, limits, and approval as separate visible steps. No campaign sends before the current content version is approved.</p>
        <p className={`mt-4 rounded-xl border p-3 text-sm ${deliveryMode === "live" ? "border-rose-400/30 bg-rose-400/5 text-rose-200" : "border-amber-300/30 bg-amber-300/5 text-amber-100"}`} role="status">Delivery mode: {deliveryMode}. {deliveryMode === "test" ? "Only the server-configured test recipient is permitted." : deliveryMode === "live" ? "Approved messages can reach real recipients after explicit authorization." : "Outbound campaign delivery is disabled."}</p>

        <div className="mt-8 grid gap-6 xl:grid-cols-[360px_1fr]">
          <div className="space-y-6">
            <form onSubmit={submitCampaign} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <h2 className="flex items-center gap-2 font-semibold"><Plus size={18} /> New draft campaign</h2>
              <div className="mt-4 space-y-3">
                <input aria-label="Campaign name" required placeholder="Campaign name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3" />
                <textarea aria-label="Sales goal" required placeholder="Sales goal" value={form.salesGoal} onChange={(event) => setForm({ ...form, salesGoal: event.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3" />
                <input aria-label="Product or service" required placeholder="Product or service" value={form.productService} onChange={(event) => setForm({ ...form, productService: event.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3" />
                <textarea aria-label="Value proposition" required placeholder="Truthful value proposition" value={form.valueProposition} onChange={(event) => setForm({ ...form, valueProposition: event.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3" />
                <input aria-label="Sender display name" required placeholder="Verified sender name" value={form.senderName} onChange={(event) => setForm({ ...form, senderName: event.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3" />
                <input aria-label="Sender email" type="email" required placeholder="Verified sender email" value={form.senderEmail} onChange={(event) => setForm({ ...form, senderEmail: event.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3" />
                <div className="grid grid-cols-2 gap-3"><select aria-label="Tone" value={form.tone} onChange={(event) => setForm({ ...form, tone: event.target.value as typeof form.tone })} className="rounded-xl border border-slate-700 bg-slate-950 p-3"><option>Professional</option><option>Friendly</option><option>Sales</option><option>Formal</option></select><input aria-label="Daily sending limit" type="number" min={1} max={1000} value={form.dailySendingLimit} onChange={(event) => setForm({ ...form, dailySendingLimit: Number(event.target.value) })} className="rounded-xl border border-slate-700 bg-slate-950 p-3" /></div>
              </div>
              <button disabled={busy} className="mt-4 w-full rounded-xl bg-cyan-300 py-3 font-bold text-slate-950 disabled:opacity-40">Create draft</button>
            </form>

            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <h2 className="font-semibold">Campaign list</h2>
              <div className="mt-4 space-y-2">{campaigns.length ? campaigns.map((campaign) => <button type="button" key={campaign.id} onClick={() => void openCampaign(campaign.id)} className={`w-full rounded-xl border p-4 text-left ${selected?.id === campaign.id ? "border-cyan-300/40 bg-cyan-300/5" : "border-slate-800 bg-slate-950 hover:border-slate-700"}`}><div className="flex items-center justify-between gap-2"><span className="font-medium">{campaign.name}</span><span className="text-[11px] text-slate-400">{campaign.status.replaceAll("_", " ")}</span></div><p className="mt-2 text-xs text-slate-400">{campaign._count.recipients} recipients · {campaign._count.messages} messages</p></button>) : <p className="text-sm text-slate-400">No campaigns yet.</p>}</div>
            </section>
          </div>

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
            {!selected ? <div className="grid min-h-[620px] place-items-center text-center text-slate-400"><div><ShieldCheck className="mx-auto mb-4" size={36} /><p>Select a campaign to review its approval workflow.</p></div></div> : (
              <div>
                <div className="flex flex-col gap-4 border-b border-slate-800 pb-5 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-2xl font-bold">{selected.name}</h2><p className="mt-2 text-sm text-slate-400">Version {selected.contentVersion} · Approved {selected.approvedVersion ?? "not yet"}</p></div><span className="self-start rounded-full bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-200">{selected.status.replaceAll("_", " ")}</span></div>

                <div className="mt-6 grid gap-3 sm:grid-cols-4">{([[Users, "Recipients", selected.recipients.length], [FileEdit, "Drafts", selected.messages.length], [CheckCircle2, "Approvals", selected.approvals.length], [PauseCircle, "Daily limit", selected.dailySendingLimit]] satisfies Array<[LucideIcon, string, number]>).map(([Icon, label, value]) => <div key={label} className="rounded-xl bg-slate-800 p-4"><Icon className="text-cyan-300" size={18} /><p className="mt-4 text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-bold">{value}</p></div>)}</div>

                <section className="mt-6 rounded-xl border border-slate-800 p-5"><h3 className="font-semibold">1. Select recipients</h3><p className="mt-2 text-sm text-slate-400">Legacy leads and sourced public contacts remain user-owned. Grounded drafts still require linked research evidence.</p><div className="mt-4 max-h-52 space-y-2 overflow-y-auto">{contacts.map((contact) => <label key={contact.id} className="flex items-center gap-3 rounded-lg bg-slate-950 p-3 text-sm"><input type="checkbox" checked={contactIds.includes(contact.id)} onChange={(event) => setContactIds(event.target.checked ? [...contactIds, contact.id] : contactIds.filter((id) => id !== contact.id))} /><span>{contact.company?.name ?? "No company"} · {contact.name} · {contact.publicEmail ?? "Email not verified"}</span></label>)}{leads.map((lead) => <label key={lead.id} className="flex items-center gap-3 rounded-lg bg-slate-950 p-3 text-sm"><input type="checkbox" checked={leadIds.includes(lead.id)} onChange={(event) => setLeadIds(event.target.checked ? [...leadIds, lead.id] : leadIds.filter((id) => id !== lead.id))} /><span>{lead.company} · {lead.contact}</span></label>)}</div><button type="button" disabled={busy || leadIds.length + contactIds.length === 0} onClick={() => void addRecipients()} className="mt-4 rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold disabled:opacity-40">Add selected recipients</button></section>

                <section className="mt-4 rounded-xl border border-slate-800 p-5"><h3 className="font-semibold">2. Generate grounded drafts</h3><label className="mt-3 flex items-start gap-3 text-sm text-slate-400"><input type="checkbox" checked={generationConfirmed} onChange={(event) => setGenerationConfirmed(event.target.checked)} className="mt-1" /><span>I confirm this AI usage. Drafting will use only linked research evidence and may consume the monthly AI budget.</span></label><button type="button" disabled={busy || !generationConfirmed || selected.recipients.length === 0} onClick={() => void generateDrafts()} className="mt-4 rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-sm font-semibold text-cyan-200 disabled:opacity-40">Generate review drafts</button></section>

                {selected.messages.length > 0 && <section className="mt-4 rounded-xl border border-slate-800 p-5"><h3 className="font-semibold">3. Review and edit every message</h3><div className="mt-4 space-y-4">{selected.messages.map((message, index) => <article key={message.id} className="rounded-xl bg-slate-950 p-4"><div className="flex items-center justify-between"><p className="text-sm font-semibold">Recipient {index + 1} · {message.kind.replaceAll("_", " ")}</p><span className="text-xs text-slate-500">{message.status}</span></div><div className="mt-3 grid gap-3"><input aria-label={`Subject ${index + 1}`} value={message.subject} onChange={(event) => setSelected({ ...selected, messages: selected.messages.map((item) => item.id === message.id ? { ...item, subject: event.target.value } : item) })} className="rounded-lg border border-slate-800 bg-slate-900 p-3" /><input aria-label={`Greeting ${index + 1}`} value={message.greeting} onChange={(event) => setSelected({ ...selected, messages: selected.messages.map((item) => item.id === message.id ? { ...item, greeting: event.target.value } : item) })} className="rounded-lg border border-slate-800 bg-slate-900 p-3" /><textarea aria-label={`Body ${index + 1}`} value={message.body} onChange={(event) => setSelected({ ...selected, messages: selected.messages.map((item) => item.id === message.id ? { ...item, body: event.target.value } : item) })} rows={5} className="rounded-lg border border-slate-800 bg-slate-900 p-3" /><input aria-label={`Call to action ${index + 1}`} value={message.cta} onChange={(event) => setSelected({ ...selected, messages: selected.messages.map((item) => item.id === message.id ? { ...item, cta: event.target.value } : item) })} className="rounded-lg border border-slate-800 bg-slate-900 p-3" /><input aria-label={`Closing ${index + 1}`} value={message.closing} onChange={(event) => setSelected({ ...selected, messages: selected.messages.map((item) => item.id === message.id ? { ...item, closing: event.target.value } : item) })} className="rounded-lg border border-slate-800 bg-slate-900 p-3" /></div><div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500"><span>{message.factsUsed.wordCount ?? "—"} words · {message.factsUsed.averageWordsPerSentence ?? "—"} avg. words/sentence</span><button type="button" onClick={() => void updateMessage(message)} disabled={busy} className="rounded-lg border border-slate-700 px-3 py-2 text-slate-200">Save manual edit</button></div></article>)}</div></section>}

                <section className="mt-4 rounded-xl border border-slate-800 p-5"><h3 className="font-semibold">4. Approve the current version</h3><p className="mt-2 text-sm text-slate-400">Approval snapshots recipients, messages, sequence configuration, sender identity, and limits. Any later edit invalidates it.</p><button type="button" disabled={busy || selected.messages.length === 0 || selected.status === "APPROVED"} onClick={() => void approve()} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2 font-bold text-slate-950 disabled:opacity-40"><CheckCircle2 size={17} /> Approve initial outreach</button></section>

                <section className="mt-4 rounded-xl border border-slate-800 p-5"><h3 className="font-semibold">5. Queue approved outreach</h3><label className="mt-3 flex items-start gap-3 text-sm text-slate-400"><input type="checkbox" checked={launchConfirmed} onChange={(event) => setLaunchConfirmed(event.target.checked)} className="mt-1" /><span>I confirm the approved recipient list, content version, sender identity, and daily limit.</span></label><button type="button" disabled={busy || !launchConfirmed || selected.status !== "APPROVED"} onClick={() => void queue()} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2 font-bold text-slate-950 disabled:opacity-40"><Send size={17} /> Queue approved messages</button></section>

                <section className="mt-4 rounded-xl border border-slate-800 p-5"><h3 className="font-semibold">6. Controlled delivery</h3><p className="mt-2 text-sm text-slate-400">Delivery is always provider-gated and rechecks approval, suppression, replies, schedule, retry count, and daily limits.</p><label className="mt-3 flex items-start gap-3 text-sm text-slate-400"><input type="checkbox" checked={sendConfirmed} onChange={(event) => setSendConfirmed(event.target.checked)} className="mt-1" /><span>I explicitly authorize processing the next due batch from this approved version.</span></label><div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy || !sendConfirmed || !["SCHEDULED", "RUNNING"].includes(selected.status)} onClick={() => void control("send-approved")} className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-40">Send next approved batch</button><button type="button" disabled={busy || !["SCHEDULED", "RUNNING"].includes(selected.status)} onClick={() => void control("pause")} className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold disabled:opacity-40">Pause</button><button type="button" disabled={busy || selected.status !== "PAUSED"} onClick={() => void control("resume")} className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold disabled:opacity-40">Resume</button><button type="button" disabled={busy || ["COMPLETED", "CANCELLED"].includes(selected.status)} onClick={() => void control("stop")} className="rounded-xl border border-rose-500/40 px-4 py-2 text-sm font-semibold text-rose-300 disabled:opacity-40">Stop</button></div></section>
              </div>
            )}
          </section>
        </div>
      </div>
    </Layout>
  );
}
