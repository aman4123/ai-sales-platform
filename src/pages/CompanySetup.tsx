import { useEffect, useState } from "react";
import { BookOpenCheck, Building2, CheckCircle2, Gauge, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import Layout from "../components/layout/Layout";
import { apiErrorMessage } from "../services/api";
import {
  approveCompanyProfile,
  getCompanyProfile,
  getSalesDepartmentStatus,
  updateSalesDepartmentConfig,
  updateCompanyProfile,
  type CompanyProfile,
  type CompanyProfileInput,
  type SalesDepartmentConfigInput,
} from "../services/v2";

const blankProfile: CompanyProfileInput = {
  companyName: "",
  website: "",
  industry: "",
  description: "",
  products: [],
  services: [],
  useCases: [],
  pricingSummary: "",
  targetIndustries: [],
  targetCompanySizes: [],
  targetJobTitles: [],
  targetLocations: [],
  exclusions: [],
  valuePropositions: [],
  competitors: [],
  caseStudies: [],
  testimonials: [],
  faqs: [],
  commonObjections: [],
  knowledgeSources: [],
  preferredTone: "Professional",
  complianceRequirements: [],
  contactDetails: { email: "", phone: "", address: "" },
  meetingPreferences: { timezone: "UTC", schedulingUrl: "", assignedCloser: "" },
};

function lines(values: string[]) {
  return values.join("\n");
}

function list(value: string) {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

function pairs(value: string) {
  return list(value).map((item) => {
    const [left = "", ...right] = item.split("|");
    return [left.trim(), right.join("|").trim()] as const;
  }).filter(([left, right]) => left && right);
}

const fieldClass = "mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white";
const helper = "mt-2 text-xs leading-5 text-slate-500";
const defaultDepartmentConfig: SalesDepartmentConfigInput = {
  mode: "MANUAL",
  outreachGoal: "Find relevant companies and prepare evidence-backed outreach for human approval.",
  searchLocations: ["India"],
  approvedClaims: ["Use only claims explicitly approved in company knowledge."],
  prohibitedClaims: ["Guaranteed results", "Unapproved pricing or commitments"],
  approvalPolicy: {
    newAudience: true,
    firstOutreach: true,
    sensitiveReplies: true,
    pricing: true,
    proposals: true,
    contracts: true,
  },
  dailyContactLimit: 10,
  monthlyContactLimit: 100,
  maximumFollowUps: 2,
  maximumRetries: 3,
  quietHours: { timezone: "UTC", start: "17:00", end: "09:00" },
  budgetMinor: 0,
  currency: "USD",
  senderIdentity: {
    name: "Ava",
    role: "AI Sales Representative",
    email: "",
    disclosure: "AI Sales Representative working with the company sales team.",
  },
  humanMeetingOwner: "Sales owner",
};

export default function CompanySetup() {
  const [profile, setProfile] = useState<CompanyProfileInput>(blankProfile);
  const [metadata, setMetadata] = useState<Pick<CompanyProfile, "status" | "version" | "approvedAt">>({
    status: "DRAFT",
    version: 0,
    approvedAt: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [department, setDepartment] = useState<SalesDepartmentConfigInput>(defaultDepartmentConfig);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([getCompanyProfile(controller.signal), getSalesDepartmentStatus(controller.signal)])
      .then(([saved, status]) => {
        setProfile({
          companyName: saved.companyName,
          website: saved.website ?? "",
          industry: saved.industry ?? "",
          description: saved.description ?? "",
          products: saved.products,
          services: saved.services,
          useCases: saved.useCases,
          pricingSummary: saved.pricingSummary ?? "",
          targetIndustries: saved.targetIndustries,
          targetCompanySizes: saved.targetCompanySizes,
          targetJobTitles: saved.targetJobTitles,
          targetLocations: saved.targetLocations,
          exclusions: saved.exclusions,
          valuePropositions: saved.valuePropositions,
          competitors: saved.competitors,
          caseStudies: saved.caseStudies,
          testimonials: saved.testimonials,
          faqs: saved.faqs,
          commonObjections: saved.commonObjections,
          knowledgeSources: saved.knowledgeSources,
          preferredTone: saved.preferredTone,
          complianceRequirements: saved.complianceRequirements,
          contactDetails: saved.contactDetails,
          meetingPreferences: saved.meetingPreferences,
        });
        setMetadata({
          status: saved.status,
          version: saved.version,
          approvedAt: saved.approvedAt,
        });
        const current = status.config;
        setDepartment({
          mode: current.mode,
          outreachGoal: current.outreachGoal || defaultDepartmentConfig.outreachGoal,
          searchLocations: current.searchLocations.length > 0 ? current.searchLocations : defaultDepartmentConfig.searchLocations,
          approvedClaims: current.approvedClaims.length > 0 ? current.approvedClaims : defaultDepartmentConfig.approvedClaims,
          prohibitedClaims: current.prohibitedClaims,
          approvalPolicy: { ...defaultDepartmentConfig.approvalPolicy, ...(current.approvalPolicy ?? {}) },
          dailyContactLimit: current.dailyContactLimit,
          monthlyContactLimit: current.monthlyContactLimit,
          maximumFollowUps: current.maximumFollowUps,
          maximumRetries: current.maximumRetries,
          quietHours: { ...defaultDepartmentConfig.quietHours, ...(current.quietHours ?? {}) },
          budgetMinor: current.budgetMinor,
          currency: current.currency,
          senderIdentity: { ...defaultDepartmentConfig.senderIdentity, ...(current.senderIdentity ?? {}) },
          humanMeetingOwner: current.humanMeetingOwner || saved.meetingPreferences.assignedCloser || defaultDepartmentConfig.humanMeetingOwner,
        });
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          toast.error(apiErrorMessage(error, "Could not load company setup."));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  function set<K extends keyof CompanyProfileInput>(key: K, value: CompanyProfileInput[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  function setDepartmentField<K extends keyof SalesDepartmentConfigInput>(
    key: K,
    value: SalesDepartmentConfigInput[K],
  ) {
    setDepartment((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      const saved = await updateCompanyProfile(profile);
      setMetadata({ status: saved.status, version: saved.version, approvedAt: saved.approvedAt });
      toast.success("Company knowledge saved as a draft.");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not save company knowledge."));
    } finally {
      setSaving(false);
    }
  }

  async function approve() {
    if (!window.confirm("Approve this company knowledge for AI strategy and outreach grounding?")) return;
    setSaving(true);
    try {
      const approved = await approveCompanyProfile();
      setMetadata({
        status: approved.status,
        version: approved.version,
        approvedAt: approved.approvedAt,
      });
      toast.success("Company knowledge approved for AI use.");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not approve company knowledge."));
    } finally {
      setSaving(false);
    }
  }

  async function saveDepartment() {
    setSaving(true);
    try {
      await updateSalesDepartmentConfig(department);
      toast.success("AI Sales Department limits and approvals saved.");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not save AI Sales Department settings."));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <Layout><div className="mx-auto h-96 max-w-6xl animate-pulse rounded-2xl border border-white/10 bg-white/[.035]" /></Layout>;
  }

  return (
    <Layout>
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[.2em] text-cyan-300">Company intelligence</p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight text-white">Company Setup</h1>
            <p className="mt-3 max-w-3xl text-slate-400">
              This approved knowledge grounds strategy and outreach. Imported links remain untrusted evidence and cannot override platform policy.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[.035] px-4 py-3 text-sm">
            <p className={metadata.status === "APPROVED" ? "text-emerald-300" : "text-amber-200"}>
              {metadata.status === "APPROVED" ? "Approved for AI use" : "Draft — not yet approved"}
            </p>
            <p className="mt-1 text-xs text-slate-500">Version {metadata.version}</p>
          </div>
        </div>

        <div className="mt-8 grid gap-6">
          <section className="rounded-2xl border border-white/10 bg-[#0a141e] p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white"><Building2 size={19} className="text-cyan-300" /> Business identity</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-sm text-slate-300">Company name<input required value={profile.companyName} onChange={(event) => set("companyName", event.target.value)} className={fieldClass} /></label>
              <label className="text-sm text-slate-300">Website<input type="url" value={profile.website ?? ""} onChange={(event) => set("website", event.target.value)} placeholder="https://example.com" className={fieldClass} /></label>
              <label className="text-sm text-slate-300">Industry<input value={profile.industry ?? ""} onChange={(event) => set("industry", event.target.value)} className={fieldClass} /></label>
              <label className="text-sm text-slate-300">Preferred communication tone<select value={profile.preferredTone} onChange={(event) => set("preferredTone", event.target.value as CompanyProfileInput["preferredTone"])} className={fieldClass}><option>Professional</option><option>Friendly</option><option>Formal</option><option>Concise</option><option>Consultative</option></select></label>
            </div>
            <label className="mt-4 block text-sm text-slate-300">Company description<textarea rows={4} value={profile.description ?? ""} onChange={(event) => set("description", event.target.value)} className={fieldClass} /></label>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#0a141e] p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white"><BookOpenCheck size={19} className="text-cyan-300" /> Offer and approved claims</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <ListField label="Products" value={lines(profile.products)} onChange={(value) => set("products", list(value))} />
              <ListField label="Services" value={lines(profile.services)} onChange={(value) => set("services", list(value))} />
              <ListField label="Use cases" value={lines(profile.useCases)} onChange={(value) => set("useCases", list(value))} />
              <ListField label="Value propositions" value={lines(profile.valuePropositions)} onChange={(value) => set("valuePropositions", list(value))} />
            </div>
            <label className="mt-4 block text-sm text-slate-300">Pricing guidance<textarea rows={3} value={profile.pricingSummary ?? ""} onChange={(event) => set("pricingSummary", event.target.value)} className={fieldClass} /><p className={helper}>Describe approved public pricing guidance. The AI cannot promise discounts or contractual terms.</p></label>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#0a141e] p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white"><CheckCircle2 size={19} className="text-cyan-300" /> Ideal customers and exclusions</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <ListField label="Target industries" value={lines(profile.targetIndustries)} onChange={(value) => set("targetIndustries", list(value))} />
              <ListField label="Target company sizes" value={lines(profile.targetCompanySizes)} onChange={(value) => set("targetCompanySizes", list(value))} />
              <ListField label="Target job titles" value={lines(profile.targetJobTitles)} onChange={(value) => set("targetJobTitles", list(value))} />
              <ListField label="Target locations" value={lines(profile.targetLocations)} onChange={(value) => set("targetLocations", list(value))} />
              <ListField label="Competitors" value={lines(profile.competitors)} onChange={(value) => set("competitors", list(value))} />
              <ListField label="Never target / exclusions" value={lines(profile.exclusions)} onChange={(value) => set("exclusions", list(value))} />
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#0a141e] p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white"><ShieldCheck size={19} className="text-cyan-300" /> Knowledge, objections, and compliance</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-sm text-slate-300">FAQs<textarea rows={6} value={profile.faqs.map((item) => `${item.question} | ${item.answer}`).join("\n")} onChange={(event) => set("faqs", pairs(event.target.value).map(([question, answer]) => ({ question, answer })))} className={fieldClass} /><p className={helper}>One per line: Question | Approved answer</p></label>
              <label className="text-sm text-slate-300">Common objections<textarea rows={6} value={profile.commonObjections.map((item) => `${item.objection} | ${item.approvedResponse}`).join("\n")} onChange={(event) => set("commonObjections", pairs(event.target.value).map(([objection, approvedResponse]) => ({ objection, approvedResponse })))} className={fieldClass} /><p className={helper}>One per line: Objection | Approved response</p></label>
              <label className="text-sm text-slate-300">Knowledge source URLs<textarea rows={6} value={profile.knowledgeSources.map((item) => `${item.title} | ${item.url} | ${item.type}`).join("\n")} onChange={(event) => set("knowledgeSources", list(event.target.value).map((item) => { const [title = "", url = "", rawType = "OTHER"] = item.split("|").map((part) => part.trim()); const type = ["WEBSITE", "DOCUMENT", "CASE_STUDY", "FAQ", "OTHER"].includes(rawType) ? rawType as CompanyProfileInput["knowledgeSources"][number]["type"] : "OTHER"; return { title, url, type }; }).filter((item) => item.title && item.url))} className={fieldClass} /><p className={helper}>One per line: Title | https://source.example | WEBSITE</p></label>
              <ListField label="Compliance requirements" value={lines(profile.complianceRequirements)} onChange={(value) => set("complianceRequirements", list(value))} />
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#0a141e] p-6">
            <h2 className="text-lg font-semibold text-white">Contact and meeting handoff</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-sm text-slate-300">Contact email<input type="email" value={profile.contactDetails.email} onChange={(event) => set("contactDetails", { ...profile.contactDetails, email: event.target.value })} className={fieldClass} /></label>
              <label className="text-sm text-slate-300">Contact phone<input value={profile.contactDetails.phone} onChange={(event) => set("contactDetails", { ...profile.contactDetails, phone: event.target.value })} className={fieldClass} /></label>
              <label className="text-sm text-slate-300">Scheduling URL<input type="url" value={profile.meetingPreferences.schedulingUrl} onChange={(event) => set("meetingPreferences", { ...profile.meetingPreferences, schedulingUrl: event.target.value })} className={fieldClass} /></label>
              <label className="text-sm text-slate-300">Assigned human closer<input value={profile.meetingPreferences.assignedCloser} onChange={(event) => set("meetingPreferences", { ...profile.meetingPreferences, assignedCloser: event.target.value })} className={fieldClass} /></label>
              <label className="text-sm text-slate-300">Meeting timezone<input value={profile.meetingPreferences.timezone} onChange={(event) => set("meetingPreferences", { ...profile.meetingPreferences, timezone: event.target.value })} className={fieldClass} /></label>
              <label className="text-sm text-slate-300">Business address<input value={profile.contactDetails.address} onChange={(event) => set("contactDetails", { ...profile.contactDetails, address: event.target.value })} className={fieldClass} /></label>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#0a141e] p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white"><Gauge size={19} className="text-cyan-300" /> AI Sales Department controls</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">These limits govern bounded background work. External outreach still requires a current campaign approval and a verified, configured provider.</p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-sm text-slate-300">Autonomy mode<select value={department.mode} onChange={(event) => setDepartmentField("mode", event.target.value as SalesDepartmentConfigInput["mode"])} className={fieldClass}><option value="MANUAL">Manual — approve every external action</option><option value="ASSISTED">Assisted — automate low-risk internal work</option><option value="AUTONOMOUS">Autonomous — execute only pre-approved strategy</option></select></label>
              <label className="text-sm text-slate-300">Human meeting owner<input value={department.humanMeetingOwner} onChange={(event) => setDepartmentField("humanMeetingOwner", event.target.value)} className={fieldClass} /></label>
              <label className="text-sm text-slate-300 md:col-span-2">Outreach goal<textarea rows={3} value={department.outreachGoal} onChange={(event) => setDepartmentField("outreachGoal", event.target.value)} className={fieldClass} /></label>
              <ListField label="Where should the AI search?" value={lines(department.searchLocations)} onChange={(value) => setDepartmentField("searchLocations", list(value))} />
              <ListField label="Claims the AI may make" value={lines(department.approvedClaims)} onChange={(value) => setDepartmentField("approvedClaims", list(value))} />
              <ListField label="Prohibited claims" value={lines(department.prohibitedClaims)} onChange={(value) => setDepartmentField("prohibitedClaims", list(value))} />
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="Daily contacts" value={department.dailyContactLimit} min={1} max={1000} onChange={(value) => setDepartmentField("dailyContactLimit", value)} />
                <NumberField label="Monthly contacts" value={department.monthlyContactLimit} min={1} max={100000} onChange={(value) => setDepartmentField("monthlyContactLimit", value)} />
                <NumberField label="Maximum follow-ups" value={department.maximumFollowUps} min={0} max={10} onChange={(value) => setDepartmentField("maximumFollowUps", value)} />
                <NumberField label="Maximum retries" value={department.maximumRetries} min={0} max={10} onChange={(value) => setDepartmentField("maximumRetries", value)} />
              </div>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="text-sm text-slate-300">Sender name<input value={department.senderIdentity.name} onChange={(event) => setDepartmentField("senderIdentity", { ...department.senderIdentity, name: event.target.value })} className={fieldClass} /></label>
              <label className="text-sm text-slate-300">Sender role<input value={department.senderIdentity.role} onChange={(event) => setDepartmentField("senderIdentity", { ...department.senderIdentity, role: event.target.value })} className={fieldClass} /></label>
              <label className="text-sm text-slate-300">Authorized sender email<input type="email" value={department.senderIdentity.email} onChange={(event) => setDepartmentField("senderIdentity", { ...department.senderIdentity, email: event.target.value })} placeholder="ava@your-domain.example" className={fieldClass} /></label>
              <label className="text-sm text-slate-300">Timezone<input value={department.quietHours.timezone} onChange={(event) => setDepartmentField("quietHours", { ...department.quietHours, timezone: event.target.value })} className={fieldClass} /></label>
              <label className="text-sm text-slate-300 md:col-span-2 xl:col-span-4">AI disclosure<textarea rows={2} value={department.senderIdentity.disclosure} onChange={(event) => setDepartmentField("senderIdentity", { ...department.senderIdentity, disclosure: event.target.value })} className={fieldClass} /></label>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(Object.entries(department.approvalPolicy) as Array<[keyof SalesDepartmentConfigInput["approvalPolicy"], boolean]>).map(([key, checked]) => (
                <label key={key} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[.025] p-3 text-sm text-slate-300"><input type="checkbox" checked={checked} onChange={(event) => setDepartmentField("approvalPolicy", { ...department.approvalPolicy, [key]: event.target.checked })} className="h-4 w-4 accent-cyan-300" /> Require approval: {key.replace(/([A-Z])/g, " $1").toLowerCase()}</label>
              ))}
            </div>
            <button type="button" disabled={saving} onClick={() => void saveDepartment()} className="mt-5 w-full rounded-xl border border-cyan-300/40 px-5 py-3 font-bold text-cyan-200 disabled:opacity-50">Save department controls</button>
          </section>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button type="button" disabled={saving} onClick={() => void save()} className="flex-1 rounded-xl border border-cyan-300/40 px-5 py-3 font-bold text-cyan-200 disabled:opacity-50">{saving ? "Saving…" : "Save draft"}</button>
          <button type="button" disabled={saving || metadata.version < 1} onClick={() => void approve()} className="flex-1 rounded-xl bg-cyan-300 px-5 py-3 font-bold text-slate-950 disabled:opacity-50">Approve for AI use</button>
        </div>
      </div>
    </Layout>
  );
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <label className="text-xs text-slate-400">{label}<input type="number" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className={fieldClass} /></label>;
}

function ListField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-sm text-slate-300">
      {label}
      <textarea rows={5} value={value} onChange={(event) => onChange(event.target.value)} className={fieldClass} />
      <p className={helper}>One item per line.</p>
    </label>
  );
}
