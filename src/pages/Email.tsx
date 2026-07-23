import { useState } from "react";
import toast from "react-hot-toast";
import Layout from "../components/layout/Layout";
import { generateEmailWithAI } from "../services/ai";
import Loader from "../components/ui/Loader";
import { apiErrorMessage } from "../services/api";

type EmailTone = "Professional" | "Friendly" | "Sales" | "Formal";

export default function Email() {
  const [company, setCompany] = useState("");
  const [contact, setContact] = useState("");
  const [industry, setIndustry] = useState("");
  const [tone, setTone] = useState<EmailTone>("Professional");

  const [email, setEmail] = useState(
    "Your AI generated email will appear here..."
  );

  const [loading, setLoading] = useState(false);

  async function generateEmail() {
    if (!company.trim() || !contact.trim() || !industry.trim()) {
      toast.error("Company, contact, and industry are required.");
      return;
    }

    setLoading(true);

    try {
      const response = await generateEmailWithAI({
        company,
        contact,
        industry,
        tone,
      });
      setEmail(response);
    } catch (error) {
      setEmail(apiErrorMessage(error, "Something went wrong while generating the email."));
    } finally {
      setLoading(false);
    }
  }

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(email);
      toast.success("Email copied!");
    } catch {
      toast.error("The email could not be copied. Select the text and copy it manually.");
    }
  }

  function clearAll() {
    setCompany("");
    setContact("");
    setIndustry("");
    setTone("Professional");
    setEmail("Your AI generated email will appear here...");
  }

  return (
    <Layout>
      <h1 className="text-4xl font-bold">
        AI Email Generator
      </h1>

      <p className="mt-2 text-slate-400">
        Generate personalized sales emails in seconds.
      </p>

      <div className="mt-8 rounded-xl bg-slate-900 p-6">

        <div className="grid gap-4 md:grid-cols-2">

          <label className="sr-only" htmlFor="email-company">Company name</label>
          <input
            id="email-company"
            placeholder="Company Name"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            className="rounded-lg bg-slate-800 p-3 outline-none"
          />

          <label className="sr-only" htmlFor="email-contact">Contact name</label>
          <input
            id="email-contact"
            placeholder="Contact Name"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            className="rounded-lg bg-slate-800 p-3 outline-none"
          />

          <label className="sr-only" htmlFor="email-industry">Industry</label>
          <input
            id="email-industry"
            placeholder="Industry"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            className="rounded-lg bg-slate-800 p-3 outline-none"
          />

          <label className="sr-only" htmlFor="email-tone">Email tone</label>
          <select
            id="email-tone"
            value={tone}
            onChange={(e) => setTone(e.target.value as EmailTone)}
            className="rounded-lg bg-slate-800 p-3"
          >
            <option>Professional</option>
            <option>Friendly</option>
            <option>Sales</option>
            <option>Formal</option>
          </select>

        </div>

        <div className="mt-6 flex flex-wrap gap-3">

          <button
            type="button"
            onClick={generateEmail}
            disabled={loading}
            className="rounded-lg bg-blue-600 px-6 py-3 hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Generating..." : "Generate Email"}
          </button>

          <button
            type="button"
            onClick={() => void copyEmail()}
            className="rounded-lg bg-green-600 px-6 py-3 hover:bg-green-700"
          >
            Copy
          </button>

          <button
            type="button"
            onClick={clearAll}
            className="rounded-lg bg-red-600 px-6 py-3 hover:bg-red-700"
          >
            Clear
          </button>

        </div>

        {loading ? (
  <div className="mt-8 rounded-xl bg-slate-800">
    <Loader />
  </div>
) : (
  <textarea
    aria-label="Generated email"
    value={email}
    readOnly
    className="mt-8 h-96 w-full rounded-xl bg-slate-800 p-6 outline-none whitespace-pre-wrap"
  />
)}
      </div>
    </Layout>
  );
}
