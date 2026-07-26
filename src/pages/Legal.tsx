import { ArrowLeft } from "lucide-react";
import { Link, useLocation } from "react-router";

const content = {
  "/terms": {
    title: "Terms of use",
    body: "Use the platform only for lawful, relevant B2B activity. You remain responsible for recipient selection, source rights, message approval, sender identity, and compliance with applicable privacy and anti-spam laws. Do not upload private personal data or use the service for unsolicited bulk messaging.",
  },
  "/privacy": {
    title: "Privacy principles",
    body: "The platform is designed to retain user-owned CRM data, public professional research evidence, approval records, and minimal delivery state. Provider keys remain server-side. Retention and account-deletion procedures depend on the deployment operator's configured policy.",
  },
  "/contact": {
    title: "Contact",
    body: "A public support channel has not been configured for this deployment. The deployment operator should publish a monitored contact method before inviting external users.",
  },
} as const;

export default function Legal() {
  const location = useLocation();
  const page = content[location.pathname as keyof typeof content] ?? content["/terms"];
  return (
    <main className="grid min-h-screen place-items-center bg-[#071018] px-5 py-16 text-slate-100">
      <article className="w-full max-w-3xl rounded-3xl border border-white/10 bg-slate-900/60 p-8 sm:p-12">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-cyan-300 hover:text-cyan-200"><ArrowLeft size={16} /> Back to home</Link>
        <h1 className="mt-10 text-4xl font-bold">{page.title}</h1>
        <p className="mt-6 leading-8 text-slate-300">{page.body}</p>
        <p className="mt-8 text-sm text-slate-500">This page is an operational summary and should be reviewed by qualified counsel before a public launch.</p>
      </article>
    </main>
  );
}
