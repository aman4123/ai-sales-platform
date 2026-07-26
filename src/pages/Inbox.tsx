import { useEffect, useState } from "react";
import { Inbox as InboxIcon, MessageSquareReply, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import Layout from "../components/layout/Layout";
import { apiErrorMessage } from "../services/api";
import { getInbox, type InboxReply } from "../services/v2";

export default function Inbox() {
  const [replies, setReplies] = useState<InboxReply[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    void getInbox(controller.signal).then(setReplies).catch((error) => {
      if (!controller.signal.aborted) toast.error(apiErrorMessage(error, "Could not load replies."));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, []);

  return <Layout><div className="mx-auto max-w-5xl"><p className="text-sm font-semibold uppercase tracking-[.18em] text-cyan-300">Human takeover</p><h1 className="mt-2 text-4xl font-bold">Inbox</h1><p className="mt-3 text-slate-400">Replies stop automated follow-ups and wait here for human judgment.</p>
    {loading ? <div className="mt-8 h-40 animate-pulse rounded-2xl bg-slate-900" aria-label="Loading inbox" /> : replies.length === 0 ? <div className="mt-8 rounded-2xl border border-dashed border-slate-700 p-12 text-center text-slate-400"><InboxIcon className="mx-auto mb-3" /><p>No replies need human review.</p></div> : <div className="mt-8 space-y-4">{replies.map((reply) => { const person = reply.recipient.contact?.name ?? reply.recipient.lead?.contact ?? "Recipient"; return <article key={reply.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{person}</h2><p className="text-sm text-slate-400">{reply.recipient.campaign.name}</p></div><span className="inline-flex items-center gap-2 rounded-full bg-amber-300/10 px-3 py-1 text-xs font-semibold text-amber-200"><MessageSquareReply size={14} /> Human response required</span></div><p className="mt-5 whitespace-pre-wrap rounded-xl bg-slate-950 p-4 text-sm text-slate-300">{reply.contentPreview || "Message preview was not retained by the provider."}</p><div className="mt-4 flex items-center gap-2 text-xs text-emerald-300"><ShieldCheck size={15} /><span>Automated follow-ups stopped · {new Date(reply.receivedAt).toLocaleString()}</span></div></article>;})}</div>}
  </div></Layout>;
}
