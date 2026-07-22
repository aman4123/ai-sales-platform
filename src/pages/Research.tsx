import { useState } from "react";
import toast from "react-hot-toast";
import Layout from "../components/layout/Layout";
import { askAI } from "../services/ai";
import Loader from "../components/ui/Loader";

const suggestions = [
  "Find logistics companies in Gujarat",
  "Top AI startups in India",
  "List textile exporters in Surat",
  "Best SaaS companies in Bangalore",
];

export default function Research() {
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState(
    "👋 Welcome!\n\nAsk me to research companies, industries, competitors, markets, or customers."
  );
  const [loading, setLoading] = useState(false);

  async function handleSearch() {
    if (!prompt.trim()) return;

    setLoading(true);

    try {
      const response = await askAI(prompt);
      setResult(response);
    } catch {
      setResult("❌ Something went wrong while contacting the AI.");
    }

    setLoading(false);
  }

  function copyResult() {
    navigator.clipboard.writeText(result);
    toast.success("Copied!");
  }

  function clearAll() {
    setPrompt("");
    setResult(
      "👋 Welcome!\n\nAsk me to research companies, industries, competitors, markets, or customers."
    );
  }

  return (
    <Layout>
      <h1 className="text-4xl font-bold">AI Research Agent</h1>

      <p className="mt-2 text-slate-400">
        Research companies, competitors and industries with AI.
      </p>

      <div className="mt-8 rounded-xl bg-slate-900 p-6">

        <h2 className="mb-4 text-lg font-semibold">
          Example Prompts
        </h2>

        <div className="mb-6 flex flex-wrap gap-3">
          {suggestions.map((item) => (
            <button
              key={item}
              onClick={() => setPrompt(item)}
              className="rounded-full bg-slate-800 px-4 py-2 text-sm transition hover:bg-blue-600"
            >
              {item}
            </button>
          ))}
        </div>

        <textarea
          rows={5}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask AI anything..."
          className="w-full rounded-lg bg-slate-800 p-4 outline-none resize-none"
        />

        <div className="mt-5 flex flex-wrap gap-3">

          <button
            onClick={handleSearch}
            disabled={loading}
            className="rounded-lg bg-blue-600 px-6 py-3 hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Researching..." : "🔍 Research"}
          </button>

          <button
            onClick={copyResult}
            className="rounded-lg bg-green-600 px-6 py-3 hover:bg-green-700"
          >
            📋 Copy
          </button>

          <button
            onClick={clearAll}
            className="rounded-lg bg-red-600 px-6 py-3 hover:bg-red-700"
          >
            🗑 Clear
          </button>

        </div>

        <div className="mt-8 rounded-xl border border-slate-700 bg-slate-800 p-6">

          <div className="mb-3 flex items-center justify-between">

            <h2 className="text-xl font-semibold">
              AI Result
            </h2>

          </div>

         <div className="min-h-[250px] whitespace-pre-wrap text-slate-200 leading-7">
  {loading ? <Loader /> : result}
</div>

        </div>

      </div>
    </Layout>
  );
}