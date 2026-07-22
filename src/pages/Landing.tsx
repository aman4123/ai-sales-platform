import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { askAI } from "../services/ai";

export default function Landing() {
  const navigate = useNavigate();

  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState("Ask AI anything...");
  const [loading, setLoading] = useState(false);

  async function handleAsk() {
    if (!prompt.trim()) return;

    setLoading(true);

    try {
      const answer = await askAI(prompt);
      setResult(answer || "No response");
    } catch (error: any) {
      console.error("AI Error:", error);

      setResult(
        error?.message ||
          JSON.stringify(error) ||
          "Something went wrong."
      );
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

      <div className="w-full max-w-2xl">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask anything..."
          className="w-full rounded-lg bg-slate-800 p-4 outline-none"
        />

        <button
          onClick={handleAsk}
          disabled={loading}
          className="mt-4 w-full rounded-lg bg-blue-600 p-4 hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Thinking..." : "Ask AI"}
        </button>

        <div className="mt-8 rounded-lg bg-slate-900 p-6 whitespace-pre-wrap min-h-[180px] border border-slate-800">
          {result}
        </div>

        <button
          onClick={() => navigate("/login")}
          className="mt-6 text-blue-400 hover:underline"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}