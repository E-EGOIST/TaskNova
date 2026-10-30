import TaskForm, { emptyTask, type TaskFormValue } from "./TaskForm";
import { Fragment, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import Team from "./Team";
import ReviewPanel from "./ReviewPanel";
import {
  Badge, Bar, Notice, PRIORITY_STYLE, STATUSES, STATUS_STYLE, ScoreBar, Shell, Stat, Table,
  btn, btnDanger, btnGhost, card, downloadCsv, fmt, inp, isOpen, isOverdue, pct,
} from "./ui";

/* ================= Types ================= */
type Skill = { id: number; name: string };
type Member = {
  id: number; name: string; email: string; maxHoursPerWeek: number;
  department: { name: string } | null;
  skills: { skillId: number; proficiency: number; skill: Skill }[];
};
type T = {
  id: number; title: string; description: string | null; priority: string; estimatedHours: number;
  deadline: string; status: string; category: string | null; difficulty: number; createdById: number;
  skills: { skillId: number; minLevel: number; skill: Skill }[];
};
type A = {
  id: number; taskId: number; userId: number; score: number; scoreBreakdown: Record<string, number | boolean>;
  assignedAt: string; active: boolean; user: { id: number; name: string }; task: { title: string };
};
type L = { id: number; userId: number; start: string; end: string };
type Data = {
  me: { id: number; name: string }; allMembers: boolean; members: Member[]; tasks: T[];
  assignments: A[]; leaves: L[]; skills: Skill[]; doneAt: Record<string, string>;
  needsReview: { taskId: number; title: string; assignee: string; at: string | null }[];
  reassignRequests: { taskId: number; title: string; assignee: string; reason: string; at: string }[];
};
type Sug = {
  userId: number; name: string; score: number;
  breakdown: { skillMatch: number; workload: number; availability: number; experience: number };
};
type Proposal = {
  taskId: number; title: string; hours: number; fromId: number; fromName: string;
  toId: number; toName: string; score: number;
};
type Run = (fn: () => Promise<unknown>, success?: string) => Promise<void>;

const NAV = [
  ["overview", "Overview"], ["team", "Team"], ["tasks", "Tasks"],["reviews", "Reviews"], ["allocation", "Allocation"],
  ["workload", "Workload"], ["performance", "Performance"], ["notifications", "Notifications"],
  ["reports", "Reports"], ["skills", "Skills"],
] as const;
type Tab = (typeof NAV)[number][0];

const LABELS = {
  skillMatch: "Skill (50%)", workload: "Workload (25%)",
  availability: "Availability (15%)", experience: "Experience (10%)",
} as const;

const DAY = 86400000;
const OVERLOAD = 0.8;

/* ================= Helpers ================= */
const activeAssign = (d: Data, taskId: number) => d.assignments.find((a) => a.taskId === taskId && a.active);
const openMine = (d: Data, uid: number) =>
  d.tasks.filter((t) => ["ASSIGNED", "IN_PROGRESS"].includes(t.status) && activeAssign(d, t.id)?.userId === uid);
const hoursOf = (d: Data, uid: number) => openMine(d, uid).reduce((s, t) => s + t.estimatedHours, 0);
const utilOf = (d: Data, m: Member) => hoursOf(d, m.id) / m.maxHoursPerWeek;
const nameOf = (d: Data, id: number) => d.members.find((m) => m.id === id)?.name ?? "—";
const leavesOf = (d: Data, uid: number) => d.leaves.filter((l) => l.userId === uid);
const onLeaveNow = (d: Data, uid: number) =>
  leavesOf(d, uid).some((l) => new Date(l.start).getTime() <= Date.now() && new Date(l.end).getTime() >= Date.now());
const toLocalInput = (iso: string) => {
  const x = new Date(iso);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 16);
};
const daysLeft = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / DAY);

function perf(d: Data, m: Member) {
  const mine = d.tasks.filter((t) => activeAssign(d, t.id)?.userId === m.id);
  const done = mine.filter((t) => t.status === "DONE");
  const timed = done.filter((t) => d.doneAt[t.id]);
  const late = timed.filter((t) => new Date(d.doneAt[t.id]).getTime() > new Date(t.deadline).getTime()).length;
  return {
    total: mine.length,
    done: done.length,
    late,
    onTime: timed.length - late,
    unknown: done.length - timed.length,
    overdue: mine.filter(isOverdue).length,
    open: mine.filter(isOpen).length,
    rate: mine.length ? done.length / mine.length : 0,
    doneHours: done.reduce((s, t) => s + t.estimatedHours, 0),
  };
}

type Conflict = { member: string; text: string };
function findConflicts(d: Data): Conflict[] {
  const out: Conflict[] = [];
  const now = Date.now();
  for (const m of d.members) {
    const list = openMine(d, m.id).sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
    const perDay = m.maxHoursPerWeek / 7;
    let cum = 0;
    for (const t of list) {
      cum += t.estimatedHours;
      const dl = new Date(t.deadline).getTime();
      const days = (dl - now) / DAY;
      if (days <= 0) continue;
      let leaveDays = 0;
      for (const l of leavesOf(d, m.id)) {
        const s = Math.max(new Date(l.start).getTime(), now);
        const e = Math.min(new Date(l.end).getTime(), dl);
        if (e > s) leaveDays += (e - s) / DAY;
      }
      const avail = Math.max(0, days - leaveDays) * perDay;
      if (cum > avail) {
        out.push({
          member: m.name,
          text: `"${t.title}" (${new Date(t.deadline).toLocaleDateString()}) পর্যন্ত মোট ${cum}h কাজ, কিন্তু ফাঁকা সময় ≈ ${avail.toFixed(0)}h${leaveDays > 0 ? ` (ছুটি ${leaveDays.toFixed(1)} দিন)` : ""}`,
        });
      }
    }
  }
  return out;
}

type Note = { id: string; tone: "info" | "warn" | "danger" | "ok"; kind: string; text: string; at: string };
function buildNotes(d: Data): Note[] {
  const now = Date.now();
  const out: Note[] = [];
  for (const a of d.assignments) {
    if (a.active && now - new Date(a.assignedAt).getTime() < 7 * DAY) {
      out.push({ id: `a${a.id}`, tone: "info", kind: "নতুন বরাদ্দ", text: `"${a.task.title}" → ${a.user.name}`, at: a.assignedAt });
    }
  }
  for (const t of d.tasks.filter(isOverdue)) {
    out.push({ id: `o${t.id}`, tone: "danger", kind: "Overdue", text: `"${t.title}" (${nameOf(d, activeAssign(d, t.id)?.userId ?? 0)}) deadline পেরিয়ে গেছে`, at: t.deadline });
  }
  for (const l of d.leaves) {
    if (new Date(l.start).getTime() <= now + 7 * DAY) {
      const now0 = new Date(l.start).getTime() <= now;
      out.push({
        id: `l${l.id}`, tone: "warn", kind: "Member unavailable",
        text: `${nameOf(d, l.userId)} ${now0 ? "এখন ছুটিতে" : "শীঘ্রই ছুটিতে"}: ${new Date(l.start).toLocaleDateString()} → ${new Date(l.end).toLocaleDateString()}`,
        at: l.start,
      });
    }
  }
  for (const m of d.members) {
    const u = utilOf(d, m);
    if (u >= OVERLOAD) {
      out.push({ id: `w${m.id}`, tone: "warn", kind: "Workload", text: `${m.name}-এর workload ${pct(u)} (${hoursOf(d, m.id)}h / ${m.maxHoursPerWeek}h)`, at: new Date().toISOString() });
    }
  }
  for (const t of d.tasks) {
    const at = d.doneAt[t.id];
    if (t.status === "DONE" && at && now - new Date(at).getTime() < 7 * DAY) {
      out.push({ id: `d${t.id}`, tone: "ok", kind: "সম্পন্ন", text: `"${t.title}" সম্পন্ন করেছেন ${nameOf(d, activeAssign(d, t.id)?.userId ?? 0)}`, at });
    }
  }
   for (const r of d.needsReview) {
    out.push({ id: `s${r.taskId}`, tone: "warn", kind: "Review দরকার", text: `"${r.title}" — ${r.assignee} Submit করেছেন`, at: r.at ?? new Date().toISOString() });
  }
  for (const r of d.reassignRequests) {
    out.push({ id: `q${r.taskId}`, tone: "warn", kind: "Reassign অনুরোধ", text: `"${r.title}" — ${r.assignee}: ${r.reason}`, at: r.at });
  }

  // জরুরি আগে (overdue, review), তারপর সময় অনুযায়ী
  const rank: Record<Note["tone"], number> = { danger: 0, warn: 1, info: 2, ok: 3 };
  return out.sort((a, b) => rank[a.tone] - rank[b.tone] || new Date(b.at).getTime() - new Date(a.at).getTime());
}

const TONE: Record<Note["tone"], string> = {
  info: "border-sky-200 bg-sky-50 text-sky-800",
  warn: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-rose-200 bg-rose-50 text-rose-800",
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

function reasonText(b: A["scoreBreakdown"]) {
  return b.manual
    ? "Manual assignment"
    : `Skill ${pct(Number(b.skillMatch))} · Workload ${pct(Number(b.workload))} · Availability ${pct(Number(b.availability))} · Experience ${pct(Number(b.experience))}`;
}

/* ================= Overview ================= */
function Overview({ data, notes, go }: { data: Data; notes: Note[]; go: (t: Tab) => void }) {
  const cnt = (s: string) => data.tasks.filter((t) => t.status === s).length;
  const pending = data.tasks.filter((t) => t.status === "PENDING");
  const overdue = data.tasks.filter(isOverdue);
  const urgent = data.tasks.filter((t) => t.priority === "URGENT" && isOpen(t));
  const overloaded = data.members.filter((m) => utilOf(data, m) >= OVERLOAD);
  const away = data.members.filter((m) => onLeaveNow(data, m.id));
  const upcoming = data.tasks
    .filter((t) => isOpen(t) && !isOverdue(t))
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
    .slice(0, 6);

  return (
    <div className="space-y-6">
      {data.allMembers && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          আপনার নামে কোনো member বরাদ্দ নেই, তাই সব সক্রিয় member দেখানো হচ্ছে। Admin "Users" থেকে member-দের আপনার (Manager) নামে দিলে এখানে শুধু আপনার টিম দেখাবে।
        </p>
      )}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Team members" value={data.members.length} />
        <Stat label="Needs assignment" value={pending.length} tone="text-amber-600" />
        <Stat label="In progress" value={cnt("ASSIGNED") + cnt("IN_PROGRESS")} tone="text-indigo-600" />
        <Stat label="Completed" value={cnt("DONE")} tone="text-emerald-600" />
        <Stat label="Overdue" value={overdue.length} tone="text-rose-600" />
        <Stat label="Urgent (open)" value={urgent.length} tone="text-rose-600" />
        <Stat label="Overloaded" value={overloaded.length} tone="text-rose-600" />
        <Stat label="On leave now" value={away.length} tone="text-amber-600" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className={`${card} p-5`}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">আসন্ন deadline</h3>
            <button className={btnGhost} onClick={() => go("tasks")}>Tasks</button>
          </div>
          {upcoming.length === 0 && <p className="text-sm text-slate-500">কোনো আসন্ন deadline নেই</p>}
          <ul className="space-y-2">
            {upcoming.map((t) => {
              const dl = daysLeft(t.deadline);
              return (
                <li key={t.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-slate-800">{t.title}</span>
                  <span className={dl <= 2 ? "font-medium text-rose-600" : "text-slate-500"}>
                    {dl <= 0 ? "আজ" : `${dl} দিন`}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className={`${card} p-5`}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">সাম্প্রতিক alert</h3>
            <button className={btnGhost} onClick={() => go("notifications")}>সব দেখুন</button>
          </div>
          {notes.length === 0 && <p className="text-sm text-slate-500">কোনো alert নেই 🎉</p>}
          <ul className="space-y-2">
            {notes.slice(0, 5).map((n) => (
              <li key={n.id} className={`rounded-lg border px-3 py-2 text-sm ${TONE[n.tone]}`}>
                <b>{n.kind}:</b> {n.text}
              </li>
            ))}
          </ul>
        </div>

        <div className={`${card} p-5 lg:col-span-2`}>
          <h3 className="mb-4 font-semibold">Team workload</h3>
          <div className="grid gap-x-8 md:grid-cols-2">
            {data.members.map((m) => (
              <Bar key={m.id} label={m.name} value={utilOf(data, m)} right={`${hoursOf(data, m.id)}h / ${m.maxHoursPerWeek}h`} />
            ))}
          </div>
          {data.members.length === 0 && <p className="text-sm text-slate-500">কোনো member নেই</p>}
        </div>
      </div>
    </div>
  );
}

/* ================= Team ================= */
function TeamTab({ data }: { data: Data }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <Table head={["Member", "Department", "Skills", "Workload", "Availability", ""]}>
      {data.members.map((m) => {
        const u = utilOf(data, m);
        const away = onLeaveNow(data, m.id);
        const p = perf(data, m);
        return (
          <Fragment key={m.id}>
            <tr>
              <td className="px-4 py-3">
                <p className="font-medium text-slate-900">{m.name}</p>
                <p className="text-xs text-slate-500">{m.email}</p>
              </td>
              <td className="px-4 py-3 text-slate-600">{m.department?.name ?? "—"}</td>
              <td className="px-4 py-3">
                <div className="flex max-w-[16rem] flex-wrap gap-1">
                  {m.skills.map((s) => (
                    <Badge key={s.skillId} text={`${s.skill.name} ${s.proficiency}/5`} cls="bg-indigo-50 text-indigo-700 ring-indigo-600/20" />
                  ))}
                  {m.skills.length === 0 && <span className="text-xs text-slate-400">skill নেই</span>}
                </div>
              </td>
              <td className="w-48 px-4 py-3">
                <Bar label="" value={u} right={`${hoursOf(data, m.id)}h · ${pct(u)}`} />
              </td>
              <td className="px-4 py-3">
                <Badge
                  text={away ? "ছুটিতে" : leavesOf(data, m.id).length ? "আসন্ন ছুটি" : "Available"}
                  cls={away ? "bg-rose-50 text-rose-700 ring-rose-600/20" : leavesOf(data, m.id).length ? "bg-amber-50 text-amber-700 ring-amber-600/20" : "bg-emerald-50 text-emerald-700 ring-emerald-600/20"}
                />
              </td>
              <td className="px-4 py-3">
                <button className={btnGhost} onClick={() => setOpen(open === m.id ? null : m.id)}>
                  {open === m.id ? "বন্ধ" : "Profile"}
                </button>
              </td>
            </tr>
            {open === m.id && (
              <tr className="bg-slate-50">
                <td colSpan={6} className="px-4 py-4">
                  <div className="grid gap-6 md:grid-cols-3">
                    <div>
                      <h4 className="mb-2 text-sm font-semibold">Performance</h4>
                      <dl className="space-y-1 text-sm text-slate-700">
                        <div className="flex justify-between"><dt>মোট টাস্ক</dt><dd>{p.total}</dd></div>
                        <div className="flex justify-between"><dt>সম্পন্ন</dt><dd>{p.done}</dd></div>
                        <div className="flex justify-between"><dt>Completion rate</dt><dd>{pct(p.rate)}</dd></div>
                        <div className="flex justify-between"><dt>সময়মতো / দেরিতে</dt><dd>{p.onTime} / {p.late}</dd></div>
                        <div className="flex justify-between"><dt>Overdue</dt><dd>{p.overdue}</dd></div>
                      </dl>
                    </div>
                    <div>
                      <h4 className="mb-2 text-sm font-semibold">চলমান টাস্ক</h4>
                      <ul className="space-y-1 text-sm text-slate-700">
                        {openMine(data, m.id).map((t) => (
                          <li key={t.id}>{t.title} <span className="text-slate-400">· {t.estimatedHours}h</span></li>
                        ))}
                        {openMine(data, m.id).length === 0 && <li className="text-slate-400">নেই</li>}
                      </ul>
                    </div>
                    <div>
                      <h4 className="mb-2 text-sm font-semibold">ছুটি</h4>
                      <ul className="space-y-1 text-sm text-slate-700">
                        {leavesOf(data, m.id).map((l) => (
                          <li key={l.id}>{new Date(l.start).toLocaleDateString()} → {new Date(l.end).toLocaleDateString()}</li>
                        ))}
                        {leavesOf(data, m.id).length === 0 && <li className="text-slate-400">নেই</li>}
                      </ul>
                    </div>
                  </div>
                </td>
              </tr>
            )}
          </Fragment>
        );
      })}
      {data.members.length === 0 && <tr><td className="px-4 py-6 text-slate-500" colSpan={6}>কোনো member নেই</td></tr>}
    </Table>
  );
}

/* ================= Tasks ================= */

function TasksTab({ data, run }: { data: Data; run: Run }) {
  const [f, setF] = useState<TaskFormValue>(emptyTask);
  const [show, setShow] = useState(false);
  const [filter, setFilter] = useState("ALL");
  const [sug, setSug] = useState<Record<number, Sug[]>>({});
  const [all, setAll] = useState<Record<number, boolean>>({});
  const rows = data.tasks.filter((t) => filter === "ALL" || t.status === filter);

  function edit(t: T) {
    setF({
      id: t.id, title: t.title, description: t.description ?? "", hours: t.estimatedHours,
      deadline: toLocalInput(t.deadline), priority: t.priority, difficulty: t.difficulty,
      category: t.category ?? "", skills: t.skills.map((s) => ({ skillId: s.skillId, minLevel: s.minLevel })),
    });
    setShow(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function suggest(id: number) {
    run(async () => {
      const s = await api<Sug[]>(`/manager/tasks/${id}/suggestions`);
      setSug((p) => ({ ...p, [id]: s }));
      if (s.length === 0) throw new Error("টিমে কোনো যোগ্য সদস্য পাওয়া যায়নি (skill বা ছুটি দেখুন)");
    });
  }

  function assign(taskId: number, userId: number, msg: string) {
    run(async () => {
      await api(`/manager/tasks/${taskId}/assign`, { method: "POST", body: { userId } });
      setSug((p) => ({ ...p, [taskId]: [] }));
    }, msg);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {["ALL", ...STATUSES].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${filter === s ? "bg-indigo-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}
          >
            {s}
          </button>
        ))}
        <button className={`${btn} ml-auto`} onClick={() => { setF(emptyTask); setShow((v) => !v); }}>
          {show ? "বন্ধ করুন" : "+ নতুন টাস্ক"}
        </button>
      </div>

      {show && (
        <TaskForm
          value={f}
          onChange={setF}
          skills={data.skills}
          endpoint="/manager/tasks"
          run={run}
          onDone={() => { setF(emptyTask); setShow(false); }}
        />
      )}

      <div className="space-y-4">
        {rows.map((t) => {
          const a = activeAssign(data, t.id);
          const list = sug[t.id] ?? [];
          return (
            <div key={t.id} className={`${card} p-4`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900">{t.title}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {t.category ?? "—"} · {t.estimatedHours}h · Difficulty {t.difficulty}/5 ·{" "}
                    <span className={isOverdue(t) ? "text-rose-600" : ""}>Deadline: {fmt(t.deadline)}</span>
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
                  <div className="flex flex-wrap justify-end gap-2">
                    {t.status === "PENDING" && (
                      <>
                        <button className={btn} onClick={() => suggest(t.id)}>Suggest</button>
                        <button className={btnGhost} onClick={() => run(() => api(`/manager/tasks/${t.id}/auto-assign`, { method: "POST" }), "Auto-assign সম্পন্ন")}>Auto</button>
                      </>
                    )}
                    {isOpen(t) && (
                      <select
                        className={`${inp} py-1 text-xs`}
                        value=""
                        onChange={(e) => e.target.value && assign(t.id, Number(e.target.value), t.status === "PENDING" ? "Assign হয়েছে" : "Reassign হয়েছে")}
                      >
                        <option value="">{t.status === "PENDING" ? "Manual assign…" : "Reassign…"}</option>
                        {data.members.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}{onLeaveNow(data, m.id) ? " (ছুটিতে)" : ""}{utilOf(data, m) >= OVERLOAD ? " (⚠ বেশি কাজ)" : ""}
                          </option>
                        ))}
                      </select>
                    )}
                    <button className={btnGhost} onClick={() => edit(t)}>Edit</button>
                    {isOpen(t) && (
                      <button
                        className={btnDanger}
                        onClick={() => window.confirm(`"${t.title}" বাতিল করবেন?`) && run(() => api(`/tasks/${t.id}/status`, { method: "PATCH", body: { status: "CANCELLED" } }), "টাস্ক বাতিল হয়েছে")}
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      className={btnDanger}
                      onClick={() => window.confirm(`"${t.title}" স্থায়ীভাবে মুছবেন?`) && run(() => api(`/manager/tasks/${t.id}`, { method: "DELETE" }), "টাস্ক মোছা হয়েছে")}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>

              {list.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Top {Math.min(3, list.length)} সুপারিশ</p>
                  <div className="grid gap-3 md:grid-cols-3">
                    {list.slice(0, 3).map((s, i) => (
                      <div key={s.userId} className="rounded-lg border border-slate-200 p-3">
                        <div className="mb-3 flex justify-between">
                          <span className="font-semibold">#{i + 1} {s.name}</span>
                          <span className="font-mono text-sm text-indigo-600">{(s.score * 100).toFixed(1)}</span>
                        </div>
                        {(Object.keys(LABELS) as (keyof typeof LABELS)[]).map((k) => (
                          <ScoreBar key={k} label={LABELS[k]} value={s.breakdown[k]} />
                        ))}
                        <button className={`${btn} mt-2 w-full`} onClick={() => assign(t.id, s.userId, "Assign হয়েছে")}>Assign</button>
                      </div>
                    ))}
                  </div>
                  {list.length > 3 && (
                    <div className="mt-3">
                      <button className={btnGhost} onClick={() => setAll({ ...all, [t.id]: !all[t.id] })}>
                        {all[t.id] ? "লুকান" : `সব যোগ্য member (${list.length})`}
                      </button>
                      {all[t.id] && (
                        <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                          {list.map((s, i) => (
                            <li key={s.userId} className="flex items-center justify-between px-3 py-2 text-sm">
                              <span>#{i + 1} {s.name} <span className="font-mono text-slate-500">· {(s.score * 100).toFixed(1)}</span></span>
                              <button className={btnGhost} onClick={() => assign(t.id, s.userId, "Assign হয়েছে")}>Assign</button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
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


/* ================= Allocation history ================= */
function AllocationTab({ data }: { data: Data }) {
  return (
    <Table head={["Task", "Assigned to", "Score", "Reason (breakdown)", "Date", "State"]}>
      {data.assignments.map((a) => (
        <tr key={a.id}>
          <td className="px-4 py-3 font-medium text-slate-900">{a.task.title}</td>
          <td className="px-4 py-3 text-slate-700">{a.user.name}</td>
          <td className="px-4 py-3 font-mono text-slate-700">{a.scoreBreakdown.manual ? "—" : (a.score * 100).toFixed(1)}</td>
          <td className="px-4 py-3 text-xs text-slate-600">{reasonText(a.scoreBreakdown)}</td>
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

/* ================= Workload ================= */
function WorkloadTab({ data, run }: { data: Data; run: Run }) {
  const [props, setProps] = useState<Proposal[] | null>(null);
  const conflicts = useMemo(() => findConflicts(data), [data]);
  const overloaded = data.members.filter((m) => utilOf(data, m) >= OVERLOAD);
  const avg = data.members.length ? data.members.reduce((s, m) => s + utilOf(data, m), 0) / data.members.length : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Average load" value={pct(avg)} />
        <Stat label="Overloaded (≥80%)" value={overloaded.length} tone="text-rose-600" />
        <Stat label="On leave now" value={data.members.filter((m) => onLeaveNow(data, m.id)).length} tone="text-amber-600" />
        <Stat label="Conflicts" value={conflicts.length} tone="text-rose-600" />
      </div>

      <div className={`${card} p-5`}>
        <h3 className="mb-4 font-semibold">Member workload ও availability</h3>
        <div className="grid gap-x-8 md:grid-cols-2">
          {data.members.map((m) => {
            const u = utilOf(data, m);
            return (
              <div key={m.id}>
                <Bar label={`${m.name}${u >= OVERLOAD ? " ⚠ Overloaded" : ""}${onLeaveNow(data, m.id) ? " · ছুটিতে" : ""}`} value={u} right={`${hoursOf(data, m.id)}h / ${m.maxHoursPerWeek}h`} />
              </div>
            );
          })}
        </div>
        {data.members.length === 0 && <p className="text-sm text-slate-500">কোনো member নেই</p>}
      </div>

      <div className={`${card} p-5`}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Workload balance প্রস্তাব</h3>
          <button className={btn} onClick={() => run(async () => setProps(await api<Proposal[]>("/manager/balance")))}>
            প্রস্তাব দেখুন
          </button>
        </div>
        <p className="mb-3 text-xs text-slate-500">যাদের load ৮০%-এর বেশি, তাদের এখনো শুরু না হওয়া টাস্ক কম-load যোগ্য member-কে দেওয়ার প্রস্তাব।</p>
        {props === null && <p className="text-sm text-slate-500">"প্রস্তাব দেখুন" চাপুন</p>}
        {props !== null && props.length === 0 && <p className="text-sm text-slate-500">এখন কোনো স্থানান্তরের প্রয়োজন নেই ✅</p>}
        <ul className="space-y-2">
          {props?.map((p) => (
            <li key={p.taskId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm">
              <span>
                <b>{p.title}</b> ({p.hours}h): {p.fromName} → <b className="text-indigo-600">{p.toName}</b>{" "}
                <span className="text-slate-400">(score {(p.score * 100).toFixed(1)})</span>
              </span>
              <button
                className={btn}
                onClick={() =>
                  run(async () => {
                    await api(`/manager/tasks/${p.taskId}/assign`, { method: "POST", body: { userId: p.toId } });
                    setProps((cur) => (cur ? cur.filter((x) => x.taskId !== p.taskId) : cur));
                  }, "স্থানান্তর হয়েছে")
                }
              >
                Apply
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className={`${card} p-5`}>
        <h3 className="mb-3 font-semibold">Task conflicts</h3>
        {conflicts.length === 0 && <p className="text-sm text-slate-500">কোনো conflict নেই ✅</p>}
        <ul className="space-y-2">
          {conflicts.map((c, i) => (
            <li key={i} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <b>{c.member}:</b> {c.text}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-400">হিসাব: সাপ্তাহিক ক্ষমতা ÷ ৭ = দৈনিক ঘণ্টা, ছুটির দিন বাদ। deadline অনুযায়ী জমা কাজ ফাঁকা সময়ের বেশি হলে conflict।</p>
      </div>
    </div>
  );
}

/* ================= Performance ================= */
function PerformanceTab({ data }: { data: Data }) {
  const rows = data.members.map((m) => ({ m, p: perf(data, m) }));
  const done = data.tasks.filter((t) => t.status === "DONE");
  const total = rows.reduce((s, r) => s + r.p.total, 0);
  const doneN = rows.reduce((s, r) => s + r.p.done, 0);
  const late = rows.reduce((s, r) => s + r.p.late, 0);
  const hours = rows.reduce((s, r) => s + r.p.doneHours, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Team completion rate" value={total ? pct(doneN / total) : "—"} tone="text-emerald-600" />
        <Stat label="Completed tasks" value={doneN} tone="text-emerald-600" />
        <Stat label="Late tasks" value={late} tone="text-rose-600" />
        <Stat label="Productivity (done hours)" value={`${hours}h`} />
      </div>
      <Table head={["Member", "Assigned", "Completed", "On time", "Late", "Overdue", "Completion rate"]}>
        {rows.map(({ m, p }) => (
          <tr key={m.id}>
            <td className="px-4 py-3 font-medium text-slate-900">{m.name}</td>
            <td className="px-4 py-3 text-slate-700">{p.total}</td>
            <td className="px-4 py-3 text-slate-700">{p.done}</td>
            <td className="px-4 py-3 text-slate-700">{p.onTime}</td>
            <td className="px-4 py-3 text-slate-700">{p.late}</td>
            <td className="px-4 py-3 text-slate-700">{p.overdue}</td>
            <td className="w-44 px-4 py-3"><Bar label="" value={p.rate} /></td>
          </tr>
        ))}
        {rows.length === 0 && <tr><td className="px-4 py-6 text-slate-500" colSpan={7}>কোনো member নেই</td></tr>}
      </Table>
      <div className={`${card} p-5`}>
        <h3 className="mb-3 font-semibold">সম্পন্ন টাস্ক</h3>
        {done.length === 0 && <p className="text-sm text-slate-500">এখনো কিছু সম্পন্ন হয়নি</p>}
        <ul className="space-y-2">
          {done.slice(0, 8).map((t) => (
            <li key={t.id} className="flex justify-between text-sm">
              <span className="text-slate-800">{t.title} <span className="text-slate-400">· {nameOf(data, activeAssign(data, t.id)?.userId ?? 0)}</span></span>
              <span className="text-slate-500">{data.doneAt[t.id] ? fmt(data.doneAt[t.id]) : "সময় রেকর্ড নেই"}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-slate-400">"On time/Late" শুধু সেই টাস্কের জন্য, যেগুলোর সম্পন্ন হওয়ার সময় রেকর্ড হয়েছে (এই আপডেটের পর সম্পন্ন)।</p>
    </div>
  );
}

/* ================= Notifications ================= */
function NotificationsTab({ notes }: { notes: Note[] }) {
  return (
    <div className="space-y-3">
      {notes.length === 0 && <p className="text-slate-500">কোনো notification নেই 🎉</p>}
      {notes.map((n) => (
        <div key={n.id} className={`rounded-lg border px-4 py-3 text-sm ${TONE[n.tone]}`}>
          <div className="flex justify-between gap-3">
            <span><b>{n.kind}:</b> {n.text}</span>
            <span className="whitespace-nowrap opacity-70">{fmt(n.at)}</span>
          </div>
        </div>
      ))}
      <p className="text-xs text-slate-400">এগুলো ডাটা থেকে সরাসরি হিসাব করা (গত ৭ দিন ও চলমান অবস্থা)। email notification এখনো নেই।</p>
    </div>
  );
}

/* ================= Reports ================= */
function ReportsTab({ data }: { data: Data }) {
  const reports = useMemo(() => {
    const who = (t: T) => nameOf(data, activeAssign(data, t.id)?.userId ?? 0);
    return [
      {
        id: "team-performance", title: "Team performance",
        cols: ["Member", "Assigned", "Completed", "On time", "Late", "Overdue", "Completion rate"],
        rows: data.members.map((m) => { const p = perf(data, m); return [m.name, p.total, p.done, p.onTime, p.late, p.overdue, pct(p.rate)]; }),
      },
      {
        id: "task-completion", title: "Task completion",
        cols: ["Task", "Priority", "Status", "Deadline", "Assignee", "Completed at"],
        rows: data.tasks.map((t) => [t.title, t.priority, t.status, fmt(t.deadline), who(t), data.doneAt[t.id] ? fmt(data.doneAt[t.id]) : "—"]),
      },
      {
        id: "team-workload", title: "Team workload",
        cols: ["Member", "Active hours", "Capacity (h)", "Utilization", "Available"],
        rows: data.members.map((m) => [m.name, hoursOf(data, m.id), m.maxHoursPerWeek, pct(utilOf(data, m)), onLeaveNow(data, m.id) ? "ছুটিতে" : "হ্যাঁ"]),
      },
      {
        id: "overdue", title: "Overdue tasks",
        cols: ["Task", "Priority", "Deadline", "Status", "Assignee"],
        rows: data.tasks.filter(isOverdue).map((t) => [t.title, t.priority, fmt(t.deadline), t.status, who(t)]),
      },
      {
        id: "allocation-history", title: "Allocation history",
        cols: ["Task", "Assigned to", "Score", "Reason", "Date", "State"],
        rows: data.assignments.map((a) => [a.task.title, a.user.name, a.scoreBreakdown.manual ? "manual" : (a.score * 100).toFixed(1), reasonText(a.scoreBreakdown), fmt(a.assignedAt), a.active ? "Current" : "Reassigned"]),
      },
    ];
  }, [data]);
  const [id, setId] = useState(reports[0].id);
  const r = reports.find((x) => x.id === id) ?? reports[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {reports.map((x) => (
          <button
            key={x.id}
            onClick={() => setId(x.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${id === x.id ? "bg-indigo-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}
          >
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

/* ================= Shell ================= */
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
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load().catch(() => {});
    }, 30000);
    return () => clearInterval(timer);
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

  const notes = useMemo(() => (data ? buildNotes(data) : []), [data]);
  const alerts = notes.filter((n) => n.tone === "danger" || n.tone === "warn").length;
  const pendingReviews = data ? data.needsReview.length + data.reassignRequests.length : 0;
  const nav = NAV.map(([id, label]) => [
    id,
    id === "notifications" && alerts > 0 ? `${label} (${alerts})`
      : id === "reviews" && pendingReviews > 0 ? `${label} (${pendingReviews})`
      : label,
  ] as const);
  return (
    <Shell nav={nav} tab={tab} onTab={setTab} user={user} roleLabel="Manager" onLogout={onLogout}>
      <Notice msg={msg} ok={ok} />
      {!data ? (
        <p className="text-slate-500">লোড হচ্ছে…</p>
      ) : (
        <>
          {tab === "overview" && <Overview data={data} notes={notes} go={setTab} />}
          {tab === "team" && <TeamTab data={data} />}
          {tab === "tasks" && <TasksTab data={data} run={run} />}
          {tab === "reviews" && <ReviewPanel />}
          {tab === "allocation" && <AllocationTab data={data} />}
          {tab === "workload" && <WorkloadTab data={data} run={run} />}
          {tab === "performance" && <PerformanceTab data={data} />}
          {tab === "notifications" && <NotificationsTab notes={notes} />}
          {tab === "reports" && <ReportsTab data={data} />}
          {tab === "skills" && <Team />}
        </>
      )}
    </Shell>
  );
}