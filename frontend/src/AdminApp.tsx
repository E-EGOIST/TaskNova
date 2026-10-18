import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "./api";
import Team from "./Team";

type Role = "ADMIN" | "MANAGER" | "MEMBER";
type Skill = { id: number; name: string };
type U = {
  id: number; name: string; email: string; role: Role; isActive: boolean; maxHoursPerWeek: number;
  departmentId: number | null; managerId: number | null;
  skills: { skillId: number; proficiency: number; skill: Skill }[];
};
type T = {
  id: number; title: string; description: string | null; priority: string; estimatedHours: number;
  deadline: string; status: string; category: string | null; difficulty: number;
  skills: { skillId: number; minLevel: number; skill: Skill }[];
};
type A = {
  id: number; taskId: number; userId: number; score: number; scoreBreakdown: Record<string, number | boolean>;
  assignedAt: string; active: boolean; task: { title: string }; user: { name: string };
};
type D = { id: number; name: string };
type L = { id: number; userId: number; start: string; end: string };
type Log = { id: number; userName: string | null; action: string; detail: string | null; createdAt: string };
type Data = { users: U[]; tasks: T[]; assignments: A[]; departments: D[]; leaves: L[]; skills: Skill[] };
type Run = (fn: () => Promise<unknown>, success?: string) => Promise<void>;

const card = "rounded-xl border border-slate-200 bg-white shadow-sm";
const inp =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500";
const btn = "rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50";
const btnGhost = "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50";

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700 ring-amber-600/20",
  ASSIGNED: "bg-sky-50 text-sky-700 ring-sky-600/20",
  IN_PROGRESS: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  DONE: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  CANCELLED: "bg-slate-100 text-slate-600 ring-slate-500/20",
};
const PRIORITY_STYLE: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-600 ring-slate-500/20",
  MEDIUM: "bg-sky-50 text-sky-700 ring-sky-600/20",
  HIGH: "bg-orange-50 text-orange-700 ring-orange-600/20",
  URGENT: "bg-rose-50 text-rose-700 ring-rose-600/20",
};
const STATUSES = ["PENDING", "ASSIGNED", "IN_PROGRESS", "DONE", "CANCELLED"];

function Badge({ text, cls }: { text: string; cls: string }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}>{text}</span>;
}
function Stat({ label, value, tone = "text-slate-900" }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className={`${card} p-4`}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone}`}>{value}</p>
    </div>
  );
}
function Th({ children }: { children?: ReactNode }) {
  return <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</th>;
}
function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className={`${card} overflow-x-auto`}>
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>{head.map((h, i) => <Th key={i}>{h}</Th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

/* ---------- helpers ---------- */
const isOpen = (t: T) => !["DONE", "CANCELLED"].includes(t.status);
const isOverdue = (t: T) => isOpen(t) && new Date(t.deadline).getTime() < Date.now();
const fmt = (d: string) => new Date(d).toLocaleString();
const toLocalInput = (d: string) => {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 16);
};
const pct = (n: number) => `${Math.round(n * 100)}%`;

function activeOf(data: Data, taskId: number) {
  return data.assignments.find((a) => a.taskId === taskId && a.active);
}
function memberStats(data: Data, u: U) {
  const mine = data.tasks.filter((t) => activeOf(data, t.id)?.userId === u.id);
  const active = mine.filter((t) => ["ASSIGNED", "IN_PROGRESS"].includes(t.status));
  const done = mine.filter((t) => t.status === "DONE");
  const hours = active.reduce((s, t) => s + t.estimatedHours, 0);
  return {
    total: mine.length,
    active: active.length,
    done: done.length,
    doneHours: done.reduce((s, t) => s + t.estimatedHours, 0),
    hours,
    util: hours / u.maxHoursPerWeek,
    rate: mine.length ? done.length / mine.length : 0,
  };
}
function downloadCsv(name: string, cols: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [cols, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = `${name}.csv`;
  a.click();
}

/* ---------- Overview ---------- */
function Overview({ data, logs }: { data: Data; logs: Log[] }) {
  const members = data.users.filter((u) => u.role === "MEMBER");
  const cnt = (s: string) => data.tasks.filter((t) => t.status === s).length;
  const overdue = data.tasks.filter(isOverdue);
  const critical = data.tasks.filter((t) => t.priority === "URGENT" && isOpen(t));
  const stats = members.map((u) => ({ u, ...memberStats(data, u) }));
  const top = [...stats].sort((a, b) => b.done - a.done).slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Total users" value={data.users.length} />
        <Stat label="Active members" value={members.filter((m) => m.isActive).length} />
        <Stat label="Total tasks" value={data.tasks.length} />
        <Stat label="Pending" value={cnt("PENDING")} tone="text-amber-600" />
        <Stat label="In progress" value={cnt("IN_PROGRESS") + cnt("ASSIGNED")} tone="text-indigo-600" />
        <Stat label="Completed" value={cnt("DONE")} tone="text-emerald-600" />
        <Stat label="Overdue" value={overdue.length} tone="text-rose-600" />
        <Stat label="Critical (Urgent)" value={critical.length} tone="text-rose-600" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className={`${card} p-5`}>
          <h3 className="mb-4 font-semibold text-slate-900">Task status</h3>
          {STATUSES.map((s) => (
            <div key={s} className="mb-3">
              <div className="mb-1 flex justify-between text-xs text-slate-600">
                <span>{s}</span><span>{cnt(s)}</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100">
                <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${data.tasks.length ? (cnt(s) / data.tasks.length) * 100 : 0}%` }} />
              </div>
            </div>
          ))}
        </div>

        <div className={`${card} p-5`}>
          <h3 className="mb-4 font-semibold text-slate-900">Member workload</h3>
          {stats.length === 0 && <p className="text-sm text-slate-500">কোনো member নেই</p>}
          {stats.map(({ u, util, hours }) => (
            <div key={u.id} className="mb-3">
              <div className="mb-1 flex justify-between text-xs text-slate-600">
                <span>{u.name}</span><span>{hours}h / {u.maxHoursPerWeek}h</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100">
                <div
                  className={`h-2 rounded-full ${util > 0.9 ? "bg-rose-500" : util > 0.6 ? "bg-amber-500" : "bg-emerald-500"}`}
                  style={{ width: `${Math.min(util, 1) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className={`${card} p-5`}>
          <h3 className="mb-3 font-semibold text-slate-900">Overdue tasks</h3>
          {overdue.length === 0 && <p className="text-sm text-slate-500">কোনো overdue টাস্ক নেই 🎉</p>}
          <ul className="space-y-2">
            {overdue.slice(0, 5).map((t) => (
              <li key={t.id} className="flex justify-between text-sm">
                <span className="text-slate-800">{t.title}</span>
                <span className="text-rose-600">{fmt(t.deadline)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className={`${card} p-5`}>
          <h3 className="mb-3 font-semibold text-slate-900">Top performers</h3>
          {top.length === 0 && <p className="text-sm text-slate-500">ডাটা নেই</p>}
          <ul className="space-y-2">
            {top.map(({ u, done, rate }) => (
              <li key={u.id} className="flex justify-between text-sm">
                <span className="text-slate-800">{u.name}</span>
                <span className="text-slate-600">{done} done · {pct(rate)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className={`${card} p-5`}>
        <h3 className="mb-3 font-semibold text-slate-900">Recent activity</h3>
        {logs.length === 0 && <p className="text-sm text-slate-500">এখনো কিছু নেই</p>}
        <ul className="space-y-2">
          {logs.slice(0, 6).map((l) => (
            <li key={l.id} className="flex justify-between gap-4 text-sm">
              <span className="text-slate-800"><b>{l.userName ?? "System"}</b> · {l.action} {l.detail && <span className="text-slate-500">({l.detail})</span>}</span>
              <span className="whitespace-nowrap text-slate-400">{fmt(l.createdAt)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ---------- Users ---------- */
function Users({ data, run, meId }: { data: Data; run: Run; meId: number }) {
  const [filter, setFilter] = useState<"ALL" | Role>("ALL");
  const [q, setQ] = useState("");
  const [show, setShow] = useState(false);
  const empty = { name: "", email: "", password: "", role: "MEMBER" as Role, departmentId: "", managerId: "" };
  const [f, setF] = useState(empty);
  const managers = data.users.filter((u) => u.role === "MANAGER");
  const rows = data.users.filter(
    (u) => (filter === "ALL" || u.role === filter) && (u.name + u.email).toLowerCase().includes(q.toLowerCase())
  );
  const num = (v: string) => (v === "" ? null : Number(v));
  const patch = (id: number, body: object) => run(() => api(`/admin/users/${id}`, { method: "PATCH", body }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["ALL", "ADMIN", "MANAGER", "MEMBER"] as const).map((r) => (
          <button
            key={r}
            onClick={() => setFilter(r)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${filter === r ? "bg-indigo-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}
          >
            {r}
          </button>
        ))}
        <input className={`${inp} ml-auto w-56`} placeholder="নাম বা ইমেইল খুঁজুন" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className={btn} onClick={() => setShow((s) => !s)}>{show ? "বন্ধ করুন" : "+ ইউজার যোগ"}</button>
      </div>

      {show && (
        <div className={`${card} grid gap-3 p-4 md:grid-cols-3`}>
          <input className={inp} placeholder="পুরো নাম" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <input className={inp} placeholder="ইমেইল" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <input className={inp} type="password" placeholder="পাসওয়ার্ড (৮+ অক্ষর)" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          <select className={inp} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
            <option value="MEMBER">MEMBER</option><option value="MANAGER">MANAGER</option><option value="ADMIN">ADMIN</option>
          </select>
          <select className={inp} value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value })}>
            <option value="">Department নেই</option>
            {data.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select className={inp} value={f.managerId} onChange={(e) => setF({ ...f, managerId: e.target.value })}>
            <option value="">Manager নেই</option>
            {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <button
            className={btn}
            disabled={!f.name || !f.email || f.password.length < 8}
            onClick={() =>
              run(async () => {
                await api("/admin/users", {
                  method: "POST",
                  body: { name: f.name, email: f.email, password: f.password, role: f.role, departmentId: num(f.departmentId), managerId: num(f.managerId) },
                });
                setF(empty);
                setShow(false);
              }, "ইউজার তৈরি হয়েছে")
            }
          >
            তৈরি করুন
          </button>
        </div>
      )}

      <Table head={["User", "Role", "Department", "Manager", "Skills", "Leave", "Status", ""]}>
        {rows.map((u) => (
          <tr key={u.id} className={u.isActive ? "" : "bg-slate-50 text-slate-400"}>
            <td className="px-4 py-3">
              <p className="font-medium text-slate-900">{u.name} {u.id === meId && <span className="text-xs text-slate-400">(আপনি)</span>}</p>
              <p className="text-xs text-slate-500">{u.email}</p>
            </td>
            <td className="px-4 py-3">
              <select className={inp} value={u.role} disabled={u.id === meId} onChange={(e) => patch(u.id, { role: e.target.value })}>
                <option>ADMIN</option><option>MANAGER</option><option>MEMBER</option>
              </select>
            </td>
            <td className="px-4 py-3">
              <select className={inp} value={u.departmentId ?? ""} onChange={(e) => patch(u.id, { departmentId: num(e.target.value) })}>
                <option value="">—</option>
                {data.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </td>
            <td className="px-4 py-3">
              {u.role === "MEMBER" ? (
                <select className={inp} value={u.managerId ?? ""} onChange={(e) => patch(u.id, { managerId: num(e.target.value) })}>
                  <option value="">—</option>
                  {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              ) : <span className="text-slate-400">—</span>}
            </td>
            <td className="px-4 py-3">
              <div className="flex max-w-[14rem] flex-wrap gap-1">
                {u.skills.map((s) => <Badge key={s.skillId} text={`${s.skill.name} ${s.proficiency}/5`} cls="bg-indigo-50 text-indigo-700 ring-indigo-600/20" />)}
                {u.skills.length === 0 && <span className="text-xs text-slate-400">—</span>}
              </div>
            </td>
            <td className="px-4 py-3 text-slate-600">{data.leaves.filter((l) => l.userId === u.id).length || "—"}</td>
            <td className="px-4 py-3">
              <Badge text={u.isActive ? "Active" : "Inactive"} cls={u.isActive ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : "bg-slate-100 text-slate-600 ring-slate-500/20"} />
            </td>
            <td className="whitespace-nowrap px-4 py-3">
              <div className="flex gap-2">
                {u.id !== meId && (
                  <button className={btnGhost} onClick={() => patch(u.id, { isActive: !u.isActive })}>
                    {u.isActive ? "Deactivate" : "Activate"}
                  </button>
                )}
                <button
                  className={btnGhost}
                  onClick={() => {
                    const password = window.prompt(`${u.name}-এর নতুন পাসওয়ার্ড (৮+ অক্ষর):`);
                    if (password) run(() => api(`/admin/users/${u.id}/password`, { method: "PATCH", body: { password } }), "পাসওয়ার্ড বদলানো হয়েছে");
                  }}
                >
                  Reset
                </button>
                {u.id !== meId && (
                  <button
                    className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
                    onClick={() => window.confirm(`${u.name}-কে মুছবেন?`) && run(() => api(`/admin/users/${u.id}`, { method: "DELETE" }), "মোছা হয়েছে")}
                  >
                    Delete
                  </button>
                )}
              </div>
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

/* ---------- Departments ---------- */
function Departments({ data, run }: { data: Data; run: Run }) {
  const [name, setName] = useState("");
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input className={`${inp} w-72`} placeholder="নতুন department" value={name} onChange={(e) => setName(e.target.value)} />
        <button
          className={btn}
          disabled={name.trim().length < 2}
          onClick={() => run(async () => { await api("/admin/departments", { method: "POST", body: { name } }); setName(""); }, "Department তৈরি হয়েছে")}
        >
          যোগ
        </button>
      </div>
      <Table head={["Department", "Managers", "Members", ""]}>
        {data.departments.map((d) => {
          const us = data.users.filter((u) => u.departmentId === d.id);
          return (
            <tr key={d.id}>
              <td className="px-4 py-3 font-medium text-slate-900">{d.name}</td>
              <td className="px-4 py-3 text-slate-600">{us.filter((u) => u.role === "MANAGER").map((u) => u.name).join(", ") || "—"}</td>
              <td className="px-4 py-3 text-slate-600">{us.filter((u) => u.role === "MEMBER").length}</td>
              <td className="px-4 py-3">
                <div className="flex gap-2">
                  <button
                    className={btnGhost}
                    onClick={() => {
                      const n = window.prompt("নতুন নাম:", d.name);
                      if (n) run(() => api(`/admin/departments/${d.id}`, { method: "PATCH", body: { name: n } }), "নাম বদলানো হয়েছে");
                    }}
                  >
                    Rename
                  </button>
                  <button
                    className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
                    onClick={() => window.confirm(`${d.name} মুছবেন?`) && run(() => api(`/admin/departments/${d.id}`, { method: "DELETE" }), "মোছা হয়েছে")}
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </Table>
      <p className="text-xs text-slate-500">কাউকে department বা manager-এ দিতে "Users" ট্যাবে তার সারির ড্রপডাউন ব্যবহার করুন।</p>
    </div>
  );
}

/* ---------- Tasks ---------- */
function Tasks({ data, run }: { data: Data; run: Run }) {
  const empty = { id: 0, title: "", hours: 8, deadline: "", priority: "MEDIUM", difficulty: 3, category: "", skillId: "", minLevel: 3 };
  const [f, setF] = useState(empty);
  const [show, setShow] = useState(false);
  const members = data.users.filter((u) => u.role === "MEMBER" && u.isActive);

  function save() {
    const base = {
      title: f.title, estimatedHours: Number(f.hours), deadline: new Date(f.deadline).toISOString(),
      priority: f.priority, difficulty: Number(f.difficulty), category: f.category || null,
    };
    run(async () => {
      if (f.id) await api(`/admin/tasks/${f.id}`, { method: "PATCH", body: base });
      else
        await api("/admin/tasks", {
          method: "POST",
          body: { ...base, skills: f.skillId === "" ? [] : [{ skillId: Number(f.skillId), minLevel: Number(f.minLevel) }] },
        });
      setF(empty);
      setShow(false);
    }, f.id ? "টাস্ক আপডেট হয়েছে" : "টাস্ক তৈরি হয়েছে");
  }

  return (
    <div className="space-y-4">
      <button className={btn} onClick={() => { setF(empty); setShow((s) => !s); }}>{show ? "বন্ধ করুন" : "+ নতুন টাস্ক"}</button>
      {show && (
        <div className={`${card} grid gap-3 p-4 md:grid-cols-3`}>
          <input className={`${inp} md:col-span-3`} placeholder="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <label className="text-xs text-slate-500">Estimated hours
            <input className={`${inp} mt-1 w-full`} type="number" min={1} value={f.hours} onChange={(e) => setF({ ...f, hours: Number(e.target.value) })} />
          </label>
          <label className="text-xs text-slate-500">Deadline
            <input className={`${inp} mt-1 w-full`} type="datetime-local" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} />
          </label>
          <label className="text-xs text-slate-500">Priority
            <select className={`${inp} mt-1 w-full`} value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>
              {["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-500">Difficulty (1-5)
            <input className={`${inp} mt-1 w-full`} type="number" min={1} max={5} value={f.difficulty} onChange={(e) => setF({ ...f, difficulty: Number(e.target.value) })} />
          </label>
          <label className="text-xs text-slate-500">Category
            <input className={`${inp} mt-1 w-full`} placeholder="যেমন Frontend" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
          </label>
          {!f.id && (
            <label className="text-xs text-slate-500">Required skill / min level
              <div className="mt-1 flex gap-2">
                <select className={`${inp} flex-1`} value={f.skillId} onChange={(e) => setF({ ...f, skillId: e.target.value })}>
                  <option value="">নেই</option>
                  {data.skills.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <input className={`${inp} w-16`} type="number" min={1} max={5} value={f.minLevel} onChange={(e) => setF({ ...f, minLevel: Number(e.target.value) })} />
              </div>
            </label>
          )}
          <div className="md:col-span-3">
            <button className={btn} disabled={!f.title || !f.deadline} onClick={save}>{f.id ? "আপডেট করুন" : "তৈরি করুন"}</button>
          </div>
        </div>
      )}

      <Table head={["Task", "Priority", "Diff.", "Deadline", "Status", "Assignee", "Actions"]}>
        {data.tasks.map((t) => {
          const a = activeOf(data, t.id);
          return (
            <tr key={t.id}>
              <td className="px-4 py-3">
                <p className="font-medium text-slate-900">{t.title}</p>
                <p className="text-xs text-slate-500">
                  {t.category ?? "—"} · {t.estimatedHours}h · {t.skills.map((s) => `${s.skill.name}≥${s.minLevel}`).join(", ") || "skill নেই"}
                </p>
              </td>
              <td className="px-4 py-3"><Badge text={t.priority} cls={PRIORITY_STYLE[t.priority]} /></td>
              <td className="px-4 py-3 text-slate-600">{t.difficulty}/5</td>
              <td className={`px-4 py-3 ${isOverdue(t) ? "text-rose-600" : "text-slate-600"}`}>{fmt(t.deadline)}</td>
              <td className="px-4 py-3"><Badge text={t.status} cls={STATUS_STYLE[t.status]} /></td>
              <td className="px-4 py-3 text-slate-700">{a ? a.user.name : "—"}</td>
              <td className="whitespace-nowrap px-4 py-3">
                <div className="flex items-center gap-2">
                  {t.status === "PENDING" && (
                    <button className={btnGhost} onClick={() => run(() => api(`/admin/tasks/${t.id}/auto-assign`, { method: "POST" }), "Auto-assign সম্পন্ন")}>Auto</button>
                  )}
                  {isOpen(t) && (
                    <select
                      className={`${inp} py-1 text-xs`}
                      value=""
                      onChange={(e) => e.target.value && run(() => api(`/admin/tasks/${t.id}/assign`, { method: "POST", body: { userId: Number(e.target.value) } }), t.status === "PENDING" ? "Assign হয়েছে" : "Reassign হয়েছে")}
                    >
                      <option value="">{t.status === "PENDING" ? "Assign…" : "Reassign…"}</option>
                      {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  )}
                  <button
                    className={btnGhost}
                    onClick={() => {
                      setF({ id: t.id, title: t.title, hours: t.estimatedHours, deadline: toLocalInput(t.deadline), priority: t.priority, difficulty: t.difficulty, category: t.category ?? "", skillId: "", minLevel: 3 });
                      setShow(true);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
                    onClick={() => window.confirm(`"${t.title}" মুছবেন?`) && run(() => api(`/admin/tasks/${t.id}`, { method: "DELETE" }), "টাস্ক মোছা হয়েছে")}
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
        {data.tasks.length === 0 && <tr><td className="px-4 py-6 text-slate-500" colSpan={7}>কোনো টাস্ক নেই</td></tr>}
      </Table>
    </div>
  );
}

/* ---------- Allocation history ---------- */
function Allocation({ data }: { data: Data }) {
  const reason = (b: A["scoreBreakdown"]) =>
    b.manual
      ? "Manual assignment"
      : `Skill ${pct(Number(b.skillMatch))} · Workload ${pct(Number(b.workload))} · Availability ${pct(Number(b.availability))} · Experience ${pct(Number(b.experience))}`;
  return (
    <Table head={["Task", "Assigned to", "Score", "Reason (breakdown)", "Date", "State"]}>
      {data.assignments.map((a) => (
        <tr key={a.id}>
          <td className="px-4 py-3 font-medium text-slate-900">{a.task.title}</td>
          <td className="px-4 py-3 text-slate-700">{a.user.name}</td>
          <td className="px-4 py-3 font-mono text-slate-700">{a.scoreBreakdown.manual ? "—" : (a.score * 100).toFixed(1)}</td>
          <td className="px-4 py-3 text-xs text-slate-600">{reason(a.scoreBreakdown)}</td>
          <td className="whitespace-nowrap px-4 py-3 text-slate-500">{fmt(a.assignedAt)}</td>
          <td className="px-4 py-3">
            <Badge text={a.active ? "Current" : "Reassigned"} cls={a.active ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : "bg-slate-100 text-slate-600 ring-slate-500/20"} />
          </td>
        </tr>
      ))}
      {data.assignments.length === 0 && <tr><td className="px-4 py-6 text-slate-500" colSpan={6}>এখনো কোনো assignment নেই</td></tr>}
    </Table>
  );
}

/* ---------- Reports ---------- */
function Reports({ data }: { data: Data }) {
  const reports = useMemo(() => {
    const members = data.users.filter((u) => u.role === "MEMBER");
    const nameOf = (t: T) => activeOf(data, t.id)?.user.name ?? "—";
    return [
      {
        id: "completion", title: "Task completion",
        cols: ["Task", "Priority", "Status", "Deadline", "Assignee"],
        rows: data.tasks.map((t) => [t.title, t.priority, t.status, fmt(t.deadline), nameOf(t)]),
      },
      {
        id: "performance", title: "Member performance",
        cols: ["Member", "Assigned", "Done", "In progress", "Completion rate"],
        rows: members.map((u) => { const s = memberStats(data, u); return [u.name, s.total, s.done, s.active, pct(s.rate)]; }),
      },
      {
        id: "workload", title: "Workload",
        cols: ["Member", "Active hours", "Capacity (h)", "Utilization"],
        rows: members.map((u) => { const s = memberStats(data, u); return [u.name, s.hours, u.maxHoursPerWeek, pct(s.util)]; }),
      },
      {
        id: "overdue", title: "Overdue tasks",
        cols: ["Task", "Priority", "Deadline", "Status", "Assignee"],
        rows: data.tasks.filter(isOverdue).map((t) => [t.title, t.priority, fmt(t.deadline), t.status, nameOf(t)]),
      },
      {
        id: "department", title: "Department performance",
        cols: ["Department", "Members", "Tasks", "Done", "Completion rate"],
        rows: data.departments.map((d) => {
          const ms = members.filter((u) => u.departmentId === d.id);
          const ss = ms.map((u) => memberStats(data, u));
          const total = ss.reduce((s, x) => s + x.total, 0);
          const done = ss.reduce((s, x) => s + x.done, 0);
          return [d.name, ms.length, total, done, total ? pct(done / total) : "—"];
        }),
      },
      {
        id: "allocation", title: "Task allocation",
        cols: ["Task", "Assigned to", "Score", "Date", "State"],
        rows: data.assignments.map((a) => [a.task.title, a.user.name, a.scoreBreakdown.manual ? "manual" : (a.score * 100).toFixed(1), fmt(a.assignedAt), a.active ? "Current" : "Reassigned"]),
      },
      {
        id: "productivity", title: "Productivity",
        cols: ["Member", "Completed tasks", "Completed hours"],
        rows: members.map((u) => { const s = memberStats(data, u); return [u.name, s.done, s.doneHours]; }),
      },
    ];
  }, [data]);
  const [id, setId] = useState("completion");
  const r = reports.find((x) => x.id === id)!;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {reports.map((x) => (
          <button key={x.id} onClick={() => setId(x.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${id === x.id ? "bg-indigo-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>
            {x.title}
          </button>
        ))}
        <button className={`${btn} ml-auto`} onClick={() => downloadCsv(r.id, r.cols, r.rows)}>CSV ডাউনলোড</button>
      </div>
      <Table head={r.cols}>
        {r.rows.map((row, i) => (
          <tr key={i}>{row.map((c, j) => <td key={j} className="px-4 py-3 text-slate-700">{c}</td>)}</tr>
        ))}
        {r.rows.length === 0 && <tr><td className="px-4 py-6 text-slate-500" colSpan={r.cols.length}>এই রিপোর্টে কিছু নেই</td></tr>}
      </Table>
    </div>
  );
}

/* ---------- Activity ---------- */
function Activity({ logs }: { logs: Log[] }) {
  return (
    <Table head={["Time", "User", "Action", "Detail"]}>
      {logs.map((l) => (
        <tr key={l.id}>
          <td className="whitespace-nowrap px-4 py-3 text-slate-500">{fmt(l.createdAt)}</td>
          <td className="px-4 py-3 text-slate-800">{l.userName ?? "System"}</td>
          <td className="px-4 py-3"><Badge text={l.action} cls="bg-slate-100 text-slate-700 ring-slate-500/20" /></td>
          <td className="px-4 py-3 text-slate-600">{l.detail ?? ""}</td>
        </tr>
      ))}
      {logs.length === 0 && <tr><td className="px-4 py-6 text-slate-500" colSpan={4}>এখনো কোনো কার্যকলাপ নেই</td></tr>}
    </Table>
  );
}

/* ---------- Shell ---------- */
const NAV = [
  ["overview", "Overview"], ["users", "Users"], ["departments", "Departments"], ["tasks", "Tasks"],
  ["allocation", "Allocation"], ["skills", "Skills"], ["reports", "Reports"], ["activity", "Activity"],
] as const;
type Tab = (typeof NAV)[number][0];

export default function AdminApp({ user, onLogout }: { user: { id: number; name: string; role: string }; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<Data | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");

  async function load() {
    const [d, l] = await Promise.all([api<Data>("/admin/overview"), api<Log[]>("/admin/audit")]);
    setData(d);
    setLogs(l);
  }
  useEffect(() => {
    load().catch((e) => setMsg(e.message));
  }, []);

  const run: Run = async (fn, success) => {
    setMsg("");
    setOk("");
    try {
      await fn();
      if (success) setOk(success);
      await load();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <aside className="hidden w-60 shrink-0 flex-col bg-slate-900 p-4 md:flex">
        <div className="mb-8 flex items-center gap-2 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500 font-bold italic text-white">T</div>
          <span className="text-lg font-semibold text-white">TaskNova</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`rounded-lg px-3 py-2 text-left text-sm font-medium transition ${tab === id ? "bg-indigo-600 text-white" : "text-slate-300 hover:bg-slate-800"}`}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="border-t border-slate-800 pt-4">
          <p className="px-2 text-sm font-medium text-white">{user.name}</p>
          <p className="mb-3 px-2 text-xs text-slate-400">Administrator</p>
          <button onClick={onLogout} className="w-full rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700">Logout</button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <h1 className="text-lg font-semibold">{NAV.find((n) => n[0] === tab)![1]}</h1>
          <button onClick={onLogout} className="text-sm text-slate-500 md:hidden">Logout</button>
        </header>
        <div className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2 md:hidden">
          {NAV.map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className={`whitespace-nowrap rounded-full px-3 py-1 text-xs ${tab === id ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}>
              {label}
            </button>
          ))}
        </div>

        <main className="mx-auto w-full max-w-6xl flex-1 p-6">
          {msg && <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{msg}</p>}
          {ok && <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{ok}</p>}
          {!data ? (
            <p className="text-slate-500">লোড হচ্ছে…</p>
          ) : (
            <>
              {tab === "overview" && <Overview data={data} logs={logs} />}
              {tab === "users" && <Users data={data} run={run} meId={user.id} />}
              {tab === "departments" && <Departments data={data} run={run} />}
              {tab === "tasks" && <Tasks data={data} run={run} />}
              {tab === "allocation" && <Allocation data={data} />}
              {tab === "skills" && <Team />}
              {tab === "reports" && <Reports data={data} />}
              {tab === "activity" && <Activity logs={logs} />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}