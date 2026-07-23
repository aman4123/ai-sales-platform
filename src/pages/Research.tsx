import { useState } from "react";
import toast from "react-hot-toast";
import Layout from "../components/layout/Layout";
import { researchWithAI } from "../services/ai";
import Loader from "../components/ui/Loader";
import { apiErrorMessage } from "../services/api";

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
      const response = await researchWithAI(prompt);
      setResult(response);
    } catch (error) {
      setResult(apiErrorMessage(error, "Something went wrong while contacting the AI."));
    } finally {
      setLoading(false);
    }
  }

  async function copyResult() {
    try {
      await navigator.clipboard.writeText(result);
      toast.success("Copied!");
    } catch {
      toast.error("The result could not be copied. Select the text and copy it manually.");
    }
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
              type="button"
              key={item}
              onClick={() => setPrompt(item)}
              className="rounded-full bg-slate-800 px-4 py-2 text-sm transition hover:bg-blue-600"
            >
              {item}
            </button>
          ))}
        </div>

        <label className="sr-only" htmlFor="research-prompt">Research request</label>
        <textarea
          id="research-prompt"
          rows={5}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask AI anything..."
          maxLength={4000}
          className="w-full rounded-lg bg-slate-800 p-4 outline-none resize-none"
        />

        <div className="mt-5 flex flex-wrap gap-3">

          <button
            type="button"
            onClick={handleSearch}
            disabled={loading}
            className="rounded-lg bg-blue-600 px-6 py-3 hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Researching..." : "🔍 Research"}
          </button>

          <button
            type="button"
            onClick={() => void copyResult()}
            className="rounded-lg bg-green-600 px-6 py-3 hover:bg-green-700"
          >
            📋 Copy
          </button>

          <button
            type="button"
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

         <div className="min-h-[250px] whitespace-pre-wrap text-slate-200 leading-7" aria-live="polite" aria-busy={loading}>
  {loading ? <Loader /> : result}
</div>

        </div>

      </div>
    </Layout>
  );
}
