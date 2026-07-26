import { useState } from "react";
import { FlaskConical, ShieldCheck, UserRound } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../../contexts/auth-context";
import { apiErrorMessage } from "../../services/api";
import type { AccessMode } from "../../types/api";

const labels: Record<AccessMode, string> = {
  USER: "User",
  TESTER: "Tester",
  MASTER_ADMIN: "Master Admin",
};

const icons = {
  USER: UserRound,
  TESTER: FlaskConical,
  MASTER_ADMIN: ShieldCheck,
} satisfies Record<AccessMode, typeof UserRound>;

export default function AccessModeSwitcher() {
  const { user, switchMode } = useAuth();
  const [switching, setSwitching] = useState(false);
  if (!user || user.availableModes.length < 2) return null;
  const Icon = icons[user.accessMode];

  async function changeMode(mode: AccessMode) {
    if (mode === user?.accessMode) return;
    setSwitching(true);
    try {
      await switchMode(mode);
      toast.success(`${labels[mode]} mode active.`);
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not change the testing access mode."));
    } finally {
      setSwitching(false);
    }
  }

  return (
    <label className="flex items-center gap-2 rounded-xl border border-cyan-300/15 bg-cyan-300/[.05] px-2.5 py-2 text-xs font-semibold text-cyan-100 sm:px-3">
      <Icon size={16} aria-hidden="true" />
      <span className="sr-only">Testing access mode</span>
      <select
        aria-label="Testing access mode"
        value={user.accessMode}
        disabled={switching}
        onChange={(event) => void changeMode(event.target.value as AccessMode)}
        className="max-w-24 cursor-pointer bg-transparent text-cyan-100 outline-none disabled:cursor-wait sm:max-w-none"
      >
        {user.availableModes.map((mode) => (
          <option key={mode} value={mode} className="bg-slate-950 text-slate-100">
            {labels[mode]}
          </option>
        ))}
      </select>
    </label>
  );
}
