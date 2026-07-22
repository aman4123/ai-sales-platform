import { useState } from "react";
import toast from "react-hot-toast";
import Layout from "../components/layout/Layout";
import { askAI } from "../services/ai";
import Loader from "../components/ui/Loader";

export default function Email() {
  const [company, setCompany] = useState("");
  const [contact, setContact] = useState("");
  const [industry, setIndustry] = useState("");
  const [tone, setTone] = useState("Professional");

  const [email, setEmail] = useState(
    "Your AI generated email will appear here..."
  );

  const [loading, setLoading] = useState(false);

  async function generateEmail() {
    setLoading(true);

    const prompt = `
Generate a ${tone} sales email.

Company: ${company}
Contact: ${contact}
Industry: ${industry}

Write a compelling cold email with:
- Subject
- Greeting
- Short introduction
- Value proposition
- Call to action
- Professional closing
`;

    try {
      const response = await askAI(prompt);
      setEmail(response);
    } catch {
      setEmail("Something went wrong while generating the email.");
    }

    setLoading(false);
  }

  function copyEmail() {
    navigator.clipboard.writeText(email);
    toast.success("Email copied!");
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

          <input
            placeholder="Company Name"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            className="rounded-lg bg-slate-800 p-3 outline-none"
          />

          <input
            placeholder="Contact Name"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            className="rounded-lg bg-slate-800 p-3 outline-none"
          />

          <input
            placeholder="Industry"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            className="rounded-lg bg-slate-800 p-3 outline-none"
          />

          <select
            value={tone}
            onChange={(e) => setTone(e.target.value)}
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
            onClick={generateEmail}
            disabled={loading}
            className="rounded-lg bg-blue-600 px-6 py-3 hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Generating..." : "Generate Email"}
          </button>

          <button
            onClick={copyEmail}
            className="rounded-lg bg-green-600 px-6 py-3 hover:bg-green-700"
          >
            Copy
          </button>

          <button
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
    value={email}
    readOnly
    className="mt-8 h-96 w-full rounded-xl bg-slate-800 p-6 outline-none whitespace-pre-wrap"
  />
)}
      </div>
    </Layout>
  );
}