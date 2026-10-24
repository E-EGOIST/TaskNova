import { useEffect, useState } from "react";
import { api } from "./api";
import Team from "./Team";
import {
  Badge, Bar, Notice, PRIORITY_STYLE, STATUSES, STATUS_STYLE, ScoreBar, Shell, Stat, Table,
  btn, btnDanger, btnGhost, card, fmt, inp, isOpen, isOverdue, pct,
} from "./ui";

type Skill = { id: number; name: string };
type Member = {
  id: number; name: string; email: string; maxHoursPerWeek: number;
  skills: { skillId: number; proficiency: number; skill: Skill }[];
};
type T = {
  id: number; title: string; priority: string; estimatedHours: number; deadline: string; status: string;
  skills: { skillId: number; minLevel: number; skill: Skill }[];
};
type A = { id: number; taskId: number; userId: number; score: number; user: { id: number; name: string } };
type L = { id: number; userId: number; start: string; end: string };
type Data = { members: Member[]; tasks: T[]; assignments: A[]; leaves: L[]; skills: Skill[] };
type Sug = {
  userId: number; name: string; score: number;
  breakdown: { skillMatch: number; workload: number; availability: number; experience: number };
};
type Run = (fn: () => Promise<unknown>, success?: string) => Promise<void>;

const LABELS = {
  skillMatch: "Skill (50%)",
  workload: "Workload (25%)",
  availability: "Availability (15%)",
  experience: "Experience (10%)",
} as const;

const NAV = [
  ["overview", "Overview"],
  ["tasks", "Tasks"],
  ["team", "Team"],
  ["skills", "Skills"],
] as const;
type Tab = (typeof NAV)[number][0];

const assigneeOf = (d: Data, taskId: number) => d.assignments.find((a) => a.taskId === taskId);
const hoursOf = (d: Data, userId: number) =>
  d.tasks
    .filter((t) => ["ASSIGNED", "IN_PROGRESS"].includes(t.status) && assigneeOf(d, t.id)?.userId === userId)
    .reduce((s, t) => s + t.estimatedHours, 0);

/* ---------- Overview ---------- */
function Overview({ data, go }: { data: Data; go: (t: Tab) => void }) {
  const cnt = (s: string) => data.tasks.filter((t) => t.status === s).length;
  const pending = data.tasks.filter((t) => t.status === "PENDING");
  const overdue = data.tasks.filter(isOverdue);
  const urgent = data.tasks.filter((t) => t.priority === "URGENT" && isOpen(t));
  const nameOf = (id: number) => data.members.find((m) => m.id === id)?.name ?? "—";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Needs assignment" value={pending.length} tone="text-amber-600" />
        <Stat label="In progress" value={cnt("ASSIGNED") + cnt("IN_PROGRESS")} tone="text-indigo-600" />
        <Stat label="Completed" value={cnt("DONE")} tone="text-emerald-600" />
        <Stat label="Overdue" value={overdue.length} tone="text-rose-600" />
        <Stat label="Active members" value={data.members.length} />
        <Stat label="Total tasks" value={data.tasks.length} />
        <Stat label="Urgent (open)" value={urgent.length} tone="text-rose-600" />
        <Stat label="Upcoming leaves" value={data.leaves.length} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className={`${card} p-5`}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">Assign করতে বাকি</h3>
            <button className={btnGhost} onClick={() => go("tasks")}>Tasks-এ যান</button>
          </div>
          {pending.length === 0 && <p className="text-sm text-slate-500">সব টাস্ক assign করা আছে 🎉</p>}
          <ul className="space-y-2">
            {pending.slice(0, 6).map((t) => (
              <li key={t.id} className="flex justify-between text-sm">
                <span className="text-slate-800">{t.title}</span>
                <Badge text={t.priority} cls={PRIORITY_STYLE[t.priority]} />
              </li>
            ))}
          </ul>
        </div>

        <div className={`${card} p-5`}>
          <h3 className="mb-4 font-semibold">Team workload</h3>
          {data.members.length === 0 && <p className="text-sm text-slate-500">কোনো member নেই</p>}
          {data.members.map((m) => {
            const h = hoursOf(data, m.id);
            return <Bar key={m.id} label={m.name} value={h / m.maxHoursPerWeek} right={`${h}h / ${m.maxHoursPerWeek}h`} />;
          })}
        </div>

        <div className={`${card} p-5`}>
          <h3 className="mb-3 font-semibold">Overdue</h3>
          {overdue.length === 0 && <p className="text-sm text-slate-500">কোনো overdue টাস্ক নেই 🎉</p>}
          <ul className="space-y-2">
            {overdue.slice(0, 6).map((t) => (
              <li key={t.id} className="flex justify-between text-sm">
                <span className="text-slate-800">{t.title}</span>
                <span className="text-rose-600">{fmt(t.deadline)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className={`${card} p-5`}>
          <h3 className="mb-3 font-semibold">আসন্ন ছুটি</h3>
          {data.leaves.length === 0 && <p className="text-sm text-slate-500">কারও ছুটি নেই</p>}
          <ul className="space-y-2">
            {data.leaves.slice(0, 6).map((l) => (
              <li key={l.id} className="flex justify-between text-sm">
                <span className="text-slate-800">{nameOf(l.userId)}</span>
                <span className="text-slate-500">
                  {new Date(l.start).toLocaleDateString()} → {new Date(l.end).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className={`${card} p-5`}>
        <h3 className="mb-3 font-semibold">Status</h3>
        {STATUSES.map((s) => (
          <ScoreBar key={s} label={`${s} (${cnt(s)})`} value={data.tasks.length ? cnt(s) / data.tasks.length : 0} />
        ))}
      </div>
    </div>
  );
}

/* ---------- Tasks ---------- */
function Tasks({ data, run }: { data: Data; run: Run }) {
  const empty = { title: "", hours: 8, deadline: "", priority: "MEDIUM", skillId: "" as number | "", minLevel: 3 };
  const [f, setF] = useState(empty);
  const [show, setShow] = useState(false);
  const [filter, setFilter] = useState("ALL");
  const [sug, setSug] = useState<Record<number, Sug[]>>({});
  const rows = data.tasks.filter((t) => filter === "ALL" || t.status === filter);

  function create() {
    run(async () => {
      await api("/tasks", {
        method: "POST",
        body: {
          title: f.title,
          estimatedHours: Number(f.hours),
          priority: f.priority,
          deadline: new Date(f.deadline).toISOString(),
          skills: f.skillId === "" ? [] : [{ skillId: Number(f.skillId), minLevel: Number(f.minLevel) }],
        },
      });
      setF(empty);
      setShow(false);
    }, "টাস্ক তৈরি হয়েছে");
  }

  function suggest(id: number) {
    run(async () => {
      const s = await api<Sug[]>(`/tasks/${id}/suggestions`);
      setSug((p) => ({ ...p, [id]: s }));
      if (s.length === 0) throw new Error("কোনো যোগ্য সদস্য পাওয়া যায়নি (skill বা ছুটি দেখুন)");
    });
  }

  function assign(taskId: number, userId: number) {
    run(async () => {
      await api(`/tasks/${taskId}/assign`, { method: "POST", body: { userId } });
      setSug((p) => ({ ...p, [taskId]: [] }));
    }, "Assign হয়েছে");
  }

  function cancel(t: T) {
    if (!window.confirm(`"${t.title}" বাতিল করবেন?`)) return;
    run(() => api(`/tasks/${t.id}/status`, { method: "PATCH", body: { status: "CANCELLED" } }), "টাস্ক বাতিল হয়েছে");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {["ALL", ...STATUSES].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              filter === s ? "bg-indigo-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"
            }`}
          >
            {s}
          </button>
        ))}
        <button className={`${btn} ml-auto`} onClick={() => setShow((v) => !v)}>
          {show ? "বন্ধ করুন" : "+ নতুন টাস্ক"}
        </button>
      </div>

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
          <label className="text-xs text-slate-500 md:col-span-3">Required skill / min level
            <div className="mt-1 flex gap-2">
              <select
                className={`${inp} flex-1`}
                value={f.skillId}
                onChange={(e) => setF({ ...f, skillId: e.target.value === "" ? "" : Number(e.target.value) })}
              >
                <option value="">নেই</option>
                {data.skills.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <input className={`${inp} w-20`} type="number" min={1} max={5} value={f.minLevel} onChange={(e) => setF({ ...f, minLevel: Number(e.target.value) })} />
            </div>
          </label>
          <div className="md:col-span-3">
            <button className={btn} disabled={!f.title || !f.deadline} onClick={create}>তৈরি করুন</button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {rows.map((t) => {
          const a = assigneeOf(data, t.id);
          const list = sug[t.id] ?? [];
          return (
            <div key={t.id} className={`${card} p-4`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900">{t.title}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {t.estimatedHours}h · <span className={isOverdue(t) ? "text-rose-600" : ""}>Deadline: {fmt(t.deadline)}</span>
                  </p>
                  <p className="text-sm text-slate-500">
                    Skills: {t.skills.map((s) => `${s.skill.name} (≥${s.minLevel})`).join(", ") || "নেই"}
                    {a && <> · Assignee: <b className="text-slate-700">{a.user.name}</b></>}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex gap-2">
                    <Badge text={t.priority} cls={PRIORITY_STYLE[t.priority]} />
                    <Badge text={t.status} cls={STATUS_STYLE[t.status]} />
                  </div>
                  <div className="flex gap-2">
                    {t.status === "PENDING" && <button className={btn} onClick={() => suggest(t.id)}>Suggest</button>}
                    {isOpen(t) && <button className={btnDanger} onClick={() => cancel(t)}>Cancel</button>}
                  </div>
                </div>
              </div>

              {list.length > 0 && (
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {list.map((s, i) => (
                    <div key={s.userId} className="rounded-lg border border-slate-200 p-3">
                      <div className="mb-3 flex justify-between">
                        <span className="font-semibold">#{i + 1} {s.name}</span>
                        <span className="font-mono text-sm text-indigo-600">{(s.score * 100).toFixed(1)}</span>
                      </div>
                      {(Object.keys(LABELS) as (keyof typeof LABELS)[]).map((k) => (
                        <ScoreBar key={k} label={LABELS[k]} value={s.breakdown[k]} />
                      ))}
                      <button className={`${btn} mt-2 w-full`} onClick={() => assign(t.id, s.userId)}>Assign</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {rows.length === 0 && <p className="text-slate-500">কোনো টাস্ক নেই</p>}
      </div>
    </div>
  );
}

/* ---------- Team ---------- */
function TeamView({ data }: { data: Data }) {
  return (
    <Table head={["Member", "Skills", "Workload", "Active tasks", "Leave"]}>
      {data.members.map((m) => {
        const h = hoursOf(data, m.id);
        const active = data.tasks.filter(
          (t) => ["ASSIGNED", "IN_PROGRESS"].includes(t.status) && assigneeOf(data, t.id)?.userId === m.id
        ).length;
        return (
          <tr key={m.id}>
            <td className="px-4 py-3">
              <p className="font-medium text-slate-900">{m.name}</p>
              <p className="text-xs text-slate-500">{m.email}</p>
            </td>
            <td className="px-4 py-3">
              <div className="flex max-w-[16rem] flex-wrap gap-1">
                {m.skills.map((s) => (
                  <Badge key={s.skillId} text={`${s.skill.name} ${s.proficiency}/5`} cls="bg-indigo-50 text-indigo-700 ring-indigo-600/20" />
                ))}
                {m.skills.length === 0 && <span className="text-xs text-slate-400">skill সেট করা নেই</span>}
              </div>
            </td>
            <td className="w-48 px-4 py-3">
              <Bar label="" value={h / m.maxHoursPerWeek} right={`${h}h · ${pct(h / m.maxHoursPerWeek)}`} />
            </td>
            <td className="px-4 py-3 text-slate-700">{active}</td>
            <td className="px-4 py-3 text-slate-600">{data.leaves.filter((l) => l.userId === m.id).length || "—"}</td>
          </tr>
        );
      })}
      {data.members.length === 0 && (
        <tr><td className="px-4 py-6 text-slate-500" colSpan={5}>কোনো member নেই</td></tr>
      )}
    </Table>
  );
}

/* ---------- Shell ---------- */
export default function ManagerApp({ user, onLogout }: { user: { name: string }; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<Data | null>(null);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");

  async function load() {
    setData(await api<Data>("/manager/overview"));
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
    <Shell nav={NAV} tab={tab} onTab={setTab} user={user} roleLabel="Manager" onLogout={onLogout}>
      <Notice msg={msg} ok={ok} />
      {!data ? (
        <p className="text-slate-500">লোড হচ্ছে…</p>
      ) : (
        <>
          {tab === "overview" && <Overview data={data} go={setTab} />}
          {tab === "tasks" && <Tasks data={data} run={run} />}
          {tab === "team" && <TeamView data={data} />}
          {tab === "skills" && <Team />}
        </>
      )}
    </Shell>
  );
}