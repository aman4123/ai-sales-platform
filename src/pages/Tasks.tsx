import { useEffect, useState } from "react";
import { CheckCircle2, ClipboardList } from "lucide-react";
import toast from "react-hot-toast";
import Layout from "../components/layout/Layout";
import { apiErrorMessage } from "../services/api";
import { getTasks, updateTask, type TaskItem } from "../services/v2";

export default function Tasks() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { const controller = new AbortController(); void getTasks(controller.signal).then(setTasks).catch((error) => { if (!controller.signal.aborted) toast.error(apiErrorMessage(error, "Could not load tasks.")); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, []);
  async function change(task: TaskItem, status: TaskItem["status"]) { try { const updated = await updateTask(task.id, status); setTasks((current) => current.map((item) => item.id === task.id ? updated : item)); toast.success("Task status updated."); } catch (error) { toast.error(apiErrorMessage(error, "Could not update the task.")); } }
  return <Layout><div className="mx-auto max-w-5xl"><p className="text-sm font-semibold uppercase tracking-[.18em] text-cyan-300">Human work queue</p><h1 className="mt-2 text-4xl font-bold">Tasks</h1><p className="mt-3 text-slate-400">Review replies, failures, and approvals that require a person.</p>{loading ? <div className="mt-8 h-40 animate-pulse rounded-2xl bg-slate-900" /> : tasks.length === 0 ? <div className="mt-8 rounded-2xl border border-dashed border-slate-700 p-12 text-center text-slate-400"><CheckCircle2 className="mx-auto mb-3 text-emerald-400" /><p>No tasks are waiting.</p></div> : <div className="mt-8 space-y-3">{tasks.map((task) => <article key={task.id} className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><ClipboardList className="mt-1 shrink-0 text-cyan-300" size={20} /><div><h2 className="font-semibold">{task.title}</h2><p className="mt-1 text-sm text-slate-400">{task.description || "No additional details."}</p><p className="mt-2 text-xs text-slate-500">{task.type.replaceAll("_", " ")} · {new Date(task.createdAt).toLocaleString()}</p></div></div><select aria-label={`Status for ${task.title}`} value={task.status} onChange={(event) => void change(task, event.target.value as TaskItem["status"])} className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm"><option value="OPEN">Open</option><option value="IN_PROGRESS">In progress</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option></select></article>)}</div>}</div></Layout>;
}
