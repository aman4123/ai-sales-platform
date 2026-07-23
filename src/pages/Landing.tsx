import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { askDemoAI } from "../services/ai";
import { apiErrorMessage } from "../services/api";

export default function Landing() {
  const navigate = useNavigate();

  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState("Ask AI anything...");
  const [loading, setLoading] = useState(false);

  async function handleAsk(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);

    try {
      const answer = await askDemoAI(prompt);
      setResult(answer || "No response");
    } catch (error: unknown) {
      setResult(apiErrorMessage(error, "Something went wrong."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-8">
      <h1 className="text-5xl font-bold mb-4">AI Sales Platform</h1>

      <p className="text-slate-400 mb-8">
        Powered by AI Sales Platform
      </p>

      <form className="w-full max-w-2xl" onSubmit={handleAsk}>
        <label className="sr-only" htmlFor="demo-prompt">Ask the AI sales demo</label>
        <input
          id="demo-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask anything..."
          className="w-full rounded-lg bg-slate-800 p-4 outline-none"
        />

        <button
          type="submit"
          disabled={loading}
          className="mt-4 w-full rounded-lg bg-blue-600 p-4 hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Thinking..." : "Ask AI"}
        </button>

        <div
          className="mt-8 min-h-[180px] whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-900 p-6"
          aria-live="polite"
          aria-busy={loading}
        >
          {result}
        </div>

        <button
          type="button"
          onClick={() => navigate("/login")}
          className="mt-6 text-blue-400 hover:underline"
        >
          Continue →
        </button>
      </form>
    </div>
  );
}
