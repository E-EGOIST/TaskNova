import type { ReactNode } from "react";

export const card = "rounded-xl border border-slate-200 bg-white shadow-sm";
export const inp =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500";
export const btn = "rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50";
export const btnGhost = "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50";
export const btnDanger = "rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50";

export const STATUSES = ["PENDING", "ASSIGNED", "IN_PROGRESS", "DONE", "CANCELLED"];
export const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700 ring-amber-600/20",
  ASSIGNED: "bg-sky-50 text-sky-700 ring-sky-600/20",
  IN_PROGRESS: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  DONE: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  CANCELLED: "bg-slate-100 text-slate-600 ring-slate-500/20",
};
export const PRIORITY_STYLE: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-600 ring-slate-500/20",
  MEDIUM: "bg-sky-50 text-sky-700 ring-sky-600/20",
  HIGH: "bg-orange-50 text-orange-700 ring-orange-600/20",
  URGENT: "bg-rose-50 text-rose-700 ring-rose-600/20",
};

export const isOpen = (t: { status: string }) => !["DONE", "CANCELLED"].includes(t.status);
export const isOverdue = (t: { status: string; deadline: string }) =>
  isOpen(t) && new Date(t.deadline).getTime() < Date.now();
export const fmt = (d: string) => new Date(d).toLocaleString();
export const pct = (n: number) => `${Math.round(n * 100)}%`;

export function Badge({ text, cls }: { text: string; cls: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}>{text}</span>
  );
}

export function Stat({ label, value, tone = "text-slate-900" }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className={`${card} p-4`}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone}`}>{value}</p>
    </div>
  );
}

export function Bar({ label, value, right }: { label: string; value: number; right?: string }) {
  const v = Math.max(0, Math.min(value, 1));
  const color = v > 0.9 ? "bg-rose-500" : v > 0.6 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="mb-3">
      <div className="mb-1 flex justify-between text-xs text-slate-600">
        <span>{label}</span>
        <span>{right ?? pct(v)}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${v * 100}%` }} />
      </div>
    </div>
  );
}

export function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="mb-2">
      <div className="mb-1 flex justify-between text-xs text-slate-600">
        <span>{label}</span>
        <span>{pct(value)}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100">
        <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${value * 100}%` }} />
      </div>
    </div>
  );
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className={`${card} overflow-x-auto`}>
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

export function Notice({ msg, ok }: { msg: string; ok: string }) {
  return (
    <>
      {msg && <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{msg}</p>}
      {ok && <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{ok}</p>}
    </>
  );
}

export function Shell<T extends string>({
  nav, tab, onTab, user, roleLabel, onLogout, children,
}: {
  nav: readonly (readonly [T, string])[];
  tab: T;
  onTab: (t: T) => void;
  user: { name: string };
  roleLabel: string;
  onLogout: () => void;
  children: ReactNode;
}) {
  const title = nav.find((n) => n[0] === tab)?.[1] ?? "";
  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <aside className="hidden w-60 shrink-0 flex-col bg-slate-900 p-4 md:flex">
        <div className="mb-8 flex items-center gap-2 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500 font-bold italic text-white">T</div>
          <span className="text-lg font-semibold text-white">TaskNova</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {nav.map(([id, label]) => (
            <button
              key={id}
              onClick={() => onTab(id)}
              className={`rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                tab === id ? "bg-indigo-600 text-white" : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="border-t border-slate-800 pt-4">
          <p className="px-2 text-sm font-medium text-white">{user.name}</p>
          <p className="mb-3 px-2 text-xs text-slate-400">{roleLabel}</p>
          <button onClick={onLogout} className="w-full rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700">
            Logout
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <h1 className="text-lg font-semibold">{title}</h1>
          <button onClick={onLogout} className="text-sm text-slate-500 md:hidden">Logout</button>
        </header>
        <div className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2 md:hidden">
          {nav.map(([id, label]) => (
            <button
              key={id}
              onClick={() => onTab(id)}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-xs ${
                tab === id ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <main className="mx-auto w-full max-w-6xl flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}