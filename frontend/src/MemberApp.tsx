import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import {
  Badge, Bar, Notice, PRIORITY_STYLE, STATUS_STYLE, ScoreBar, Shell, Stat, Table,
  btn, btnDanger, btnGhost, card, fmt, inp, isOverdue, pct,
} from "./ui";

/* ================= Types ================= */
type Skill = { id: number; name: string };
type Stage = "PENDING" | "ASSIGNED" | "ACCEPTED" | "IN_PROGRESS" | "SUBMITTED" | "COMPLETED" | "CANCELLED";
type Flow = {
  stage: Stage; progress: number; acceptedAt: string | null; startedAt: string | null;
  submittedAt: string | null; submitNote: string | null; completedAt: string | null;
  lastReview: { decision: "APPROVED" | "REJECTED"; note: string; at: string } | null;
  reassign: { reason: string; at: string } | null;
  reassignDeclined: string | null;
};
type Task = {
  id: number; title: string; description: string | null; priority: string; estimatedHours: number;
  deadline: string; status: string; category: string | null; difficulty: number;
  skills: { skillId: number; minLevel: number; skill: Skill }[];
};
type Item = {
  id: number; active: boolean; assignedAt: string; replacedAt: string | null; score: number;
  scoreBreakdown: Record<string, number | boolean>; task: Task; flow: Flow | null;
};
type Me = {
  id: number; name: string; email: string; role: string; maxHoursPerWeek: number;
  department: { name: string } | null; manager: { name: string } | null;
  skills: { skillId: number; proficiency: number; skill: Skill }[];
};
type Leave = { id: number; start: string; end: string };
type Review = { taskId: number; title: string; decision: "APPROVED" | "REJECTED"; note: string; at: string };
type Data = { me: Me; items: Item[]; leaves: Leave[]; allSkills: Skill[]; reviews: Review[] };
type Run = (fn: () => Promise<unknown>, success?: string) => Promise<void>;

const NAV = [
  ["overview", "Overview"], ["tasks", "My tasks"], ["notifications", "Notifications"],
  ["performance", "Performance"], ["history", "History"], ["availability", "Availability"], ["profile", "Profile"],
] as const;
type Tab = (typeof NAV)[number][0];

const DAY = 86400000;
const STEPS: Stage[] = ["ASSIGNED", "ACCEPTED", "IN_PROGRESS", "SUBMITTED", "COMPLETED"];
const STAGE_LABEL: Record<Stage, string> = {
  PENDING: "Pending", ASSIGNED: "Assigned", ACCEPTED: "Accepted", IN_PROGRESS: "In progress",
  SUBMITTED: "Submitted", COMPLETED: "Completed", CANCELLED: "Cancelled",
};
const STAGE_STYLE: Record<Stage, string> = {
  PENDING: STATUS_STYLE.PENDING, ASSIGNED: STATUS_STYLE.ASSIGNED,
  ACCEPTED: "bg-cyan-50 text-cyan-700 ring-cyan-600/20", IN_PROGRESS: STATUS_STYLE.IN_PROGRESS,
  SUBMITTED: "bg-violet-50 text-violet-700 ring-violet-600/20", COMPLETED: STATUS_STYLE.DONE,
  CANCELLED: STATUS_STYLE.CANCELLED,
};
const LABELS: [string, string][] = [
  ["skillMatch", "Skill match (50%)"], ["workload", "Workload (25%)"],
  ["availability", "Availability (15%)"], ["experience", "Experience (10%)"],
];

/* ================= Helpers ================= */
const live = (d: Data) => d.items.filter((i) => i.active);
const stageOf = (i: Item): Stage => i.flow?.stage ?? "CANCELLED";
const isActiveStage = (s: Stage) => ["ASSIGNED", "ACCEPTED", "IN_PROGRESS", "SUBMITTED"].includes(s);
const dur = (from: string, to: string) => {
  const h = (new Date(to).getTime() - new Date(from).getTime()) / 3600000;
  if (h < 0) return "—";
  return h < 48 ? `${h.toFixed(1)} ঘণ্টা` : `${(h / 24).toFixed(1)} দিন`;
};
const daysLeft = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / DAY);

function workload(d: Data) {
  const active = live(d).filter((i) => ["ASSIGNED", "IN_PROGRESS"].includes(i.task.status));
  const hours = active.reduce((s, i) => s + i.task.estimatedHours, 0);
  return { active, hours, util: hours / d.me.maxHoursPerWeek };
}

function perf(d: Data) {
  const mine = live(d).filter((i) => i.task.status !== "CANCELLED");
  const done = mine.filter((i) => i.task.status === "DONE");
  const timed = done.filter((i) => i.flow?.completedAt);
  const late = timed.filter((i) => new Date(i.flow!.completedAt!).getTime() > new Date(i.task.deadline).getTime());
  const completionRate = mine.length ? done.length / mine.length : 0;
  const onTimeRate = timed.length ? (timed.length - late.length) / timed.length : null;
  const score = mine.length ? Math.round(100 * (0.6 * completionRate + 0.4 * (onTimeRate ?? completionRate))) : null;
  return {
    total: mine.length, done, timed, late, completionRate, onTimeRate, score,
    overdue: mine.filter((i) => isOverdue(i.task)).length,
    doneHours: done.reduce((s, i) => s + i.task.estimatedHours, 0),
  };
}

type Note = { id: string; tone: "info" | "warn" | "danger" | "ok"; kind: string; text: string; at: string };
function buildNotes(d: Data): Note[] {
  const now = Date.now();
  const out: Note[] = [];
  for (const i of live(d)) {
    const st = stageOf(i);
    if (st === "ASSIGNED") {
      out.push({ id: `n${i.id}`, tone: "info", kind: "নতুন টাস্ক", text: `"${i.task.title}" আপনাকে দেওয়া হয়েছে। Accept বা শুরু করুন`, at: i.assignedAt });
    }
    if (["ASSIGNED", "ACCEPTED", "IN_PROGRESS"].includes(st)) {
      const dl = daysLeft(i.task.deadline);
      if (isOverdue(i.task)) {
        out.push({ id: `o${i.id}`, tone: "danger", kind: "Overdue", text: `"${i.task.title}" deadline পেরিয়ে গেছে`, at: i.task.deadline });
      } else if (dl <= 3) {
        out.push({ id: `r${i.id}`, tone: "warn", kind: "Deadline reminder", text: `"${i.task.title}" — ${dl <= 0 ? "আজই" : `${dl} দিন`} বাকি`, at: i.task.deadline });
      }
    }
    if (i.flow?.reassignDeclined !== null && i.flow?.reassignDeclined !== undefined) {
      out.push({ id: `x${i.id}`, tone: "warn", kind: "Reassign অনুরোধ", text: `"${i.task.title}": ${i.flow.reassignDeclined}`, at: i.assignedAt });
    }
  }
  for (const i of d.items) {
    if (!i.active && i.replacedAt && now - new Date(i.replacedAt).getTime() < 14 * DAY) {
      out.push({ id: `p${i.id}`, tone: "info", kind: "Reassigned", text: `"${i.task.title}" আপনার কাছ থেকে অন্যকে দেওয়া হয়েছে`, at: i.replacedAt });
    }
  }
  for (const r of d.reviews) {
    if (now - new Date(r.at).getTime() < 14 * DAY) {
      out.push({
        id: `v${r.taskId}${r.at}`, tone: r.decision === "APPROVED" ? "ok" : "danger",
        kind: r.decision === "APPROVED" ? "Approved" : "Rejected",
        text: `"${r.title}"${r.note ? ` — ${r.note}` : ""}`, at: r.at,
      });
    }
  }
  return out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

const TONE: Record<Note["tone"], string> = {
  info: "border-sky-200 bg-sky-50 text-sky-800",
  warn: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-rose-200 bg-rose-50 text-rose-800",
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

function Stepper({ stage }: { stage: Stage }) {
  const idx = STEPS.indexOf(stage);
  return (
    <ol className="flex flex-wrap items-center gap-1 text-xs">
      {STEPS.map((s, i) => (
        <li key={s} className="flex items-center gap-1">
          <span className={`rounded-full px-2 py-0.5 ${i <= idx ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"}`}>
            {STAGE_LABEL[s]}
          </span>
          {i < STEPS.length - 1 && <span className="text-slate-300">→</span>}
        </li>
      ))}
    </ol>
  );
}

/* ================= Overview ================= */
function Overview({ data, notes, go }: { data: Data; notes: Note[]; go: (t: Tab) => void }) {
  const w = workload(data);
  const l = live(data);
  const count = (f: (s: Stage) => boolean) => l.filter((i) => f(stageOf(i))).length;
  const upcoming = l
    .filter((i) => ["ASSIGNED", "ACCEPTED", "IN_PROGRESS"].includes(stageOf(i)) && !isOverdue(i.task))
    .sort((a, b) => new Date(a.task.deadline).getTime() - new Date(b.task.deadline).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Active" value={count((s) => ["ACCEPTED", "IN_PROGRESS"].includes(s))} tone="text-indigo-600" />
        <Stat label="Pending (শুরু হয়নি)" value={count((s) => s === "ASSIGNED")} tone="text-amber-600" />
        <Stat label="Submitted" value={count((s) => s === "SUBMITTED")} tone="text-violet-600" />
        <Stat label="Completed" value={count((s) => s === "COMPLETED")} tone="text-emerald-600" />
        <Stat label="Overdue" value={l.filter((i) => isOverdue(i.task)).length} tone="text-rose-600" />
        <Stat label="Hours" value={`${w.hours}h / ${data.me.maxHoursPerWeek}h`} />
      </div>

      <div className={`${card} p-5`}>
        <Bar label="আমার workload" value={w.util} right={`${pct(w.util)} ব্যবহৃত`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className={`${card} p-5`}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">আসন্ন deadline</h3>
            <button className={btnGhost} onClick={() => go("tasks")}>My tasks</button>
          </div>
          {upcoming.length === 0 && <p className="text-sm text-slate-500">কোনো আসন্ন deadline নেই</p>}
          <ul className="space-y-2">
            {upcoming.map((i) => {
              const dl = daysLeft(i.task.deadline);
              return (
                <li key={i.id} className="flex justify-between gap-3 text-sm">
                  <span className="text-slate-800">{i.task.title}</span>
                  <span className={dl <= 2 ? "font-medium text-rose-600" : "text-slate-500"}>{dl <= 0 ? "আজ" : `${dl} দিন`}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className={`${card} p-5`}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">সাম্প্রতিক notification</h3>
            <button className={btnGhost} onClick={() => go("notifications")}>সব দেখুন</button>
          </div>
          {notes.length === 0 && <p className="text-sm text-slate-500">কোনো notification নেই 🎉</p>}
          <ul className="space-y-2">
            {notes.slice(0, 4).map((n) => (
              <li key={n.id} className={`rounded-lg border px-3 py-2 text-sm ${TONE[n.tone]}`}>
                <b>{n.kind}:</b> {n.text}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ================= My tasks ================= */
function TaskCard({ item, me, run }: { item: Item; me: Me; run: Run }) {
  const t = item.task;
  const f = item.flow;
  const stage = stageOf(item);
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState(false);
  const [pct0, setPct0] = useState(f?.progress ?? 0);
  const [msg, setMsg] = useState("");
  const act = (path: string, body: object | undefined, ok: string) =>
    run(() => api(`/me/tasks/${t.id}/${path}`, { method: "POST", body }), ok);
  const mySkill = (id: number) => me.skills.find((s) => s.skillId === id)?.proficiency ?? 0;
  const manual = item.scoreBreakdown.manual === true;

  return (
    <div className={`${card} p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-900">{t.title}</h3>
          <p className="mt-1 text-sm text-slate-500">
            {t.category ?? "—"} · {t.estimatedHours}h · Difficulty {t.difficulty}/5 ·{" "}
            <span className={isOverdue(t) ? "text-rose-600" : ""}>Deadline: {fmt(t.deadline)}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Badge text={t.priority} cls={PRIORITY_STYLE[t.priority]} />
          <Badge text={STAGE_LABEL[stage]} cls={STAGE_STYLE[stage]} />
        </div>
      </div>

      <div className="mt-3"><Stepper stage={stage} /></div>

      {(stage === "IN_PROGRESS" || stage === "SUBMITTED" || stage === "COMPLETED") && (
        <div className="mt-3"><Bar label="Progress" value={(f?.progress ?? 0) / 100} right={`${f?.progress ?? 0}%`} /></div>
      )}

      {f?.lastReview?.decision === "REJECTED" && stage === "IN_PROGRESS" && (
        <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <b>ম্যানেজার ফেরত দিয়েছেন:</b> {f.lastReview.note || "কোনো মন্তব্য নেই"}। সংশোধন করে আবার Submit করুন।
        </p>
      )}
      {f?.reassign && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Reassign অনুরোধ পাঠানো হয়েছে, ম্যানেজারের উত্তরের অপেক্ষায়: "{f.reassign.reason}"
        </p>
      )}
      {f?.reassignDeclined && (
        <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          Reassign অনুরোধ গ্রহণ হয়নি: {f.reassignDeclined}
        </p>
      )}
      {stage === "SUBMITTED" && (
        <p className="mt-3 rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-800">
          Submit করা হয়েছে ({f?.submittedAt ? fmt(f.submittedAt) : ""}), ম্যানেজারের অনুমোদনের অপেক্ষায়।
        </p>
      )}
      {stage === "COMPLETED" && f?.completedAt && (
        <p className="mt-3 text-sm text-emerald-700">
          সম্পন্ন: {fmt(f.completedAt)} · সময় লেগেছে {dur(item.assignedAt, f.completedAt)}
        </p>
      )}

      {msg && <p className="mt-3 text-sm text-rose-600">{msg}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {stage === "ASSIGNED" && (
          <>
            <button className={btn} onClick={() => act("accept", undefined, "টাস্ক Accept করা হয়েছে")}>Accept</button>
            <button className={btnGhost} onClick={() => act("start", undefined, "টাস্ক শুরু হয়েছে")}>শুরু করুন</button>
          </>
        )}
        {stage === "ACCEPTED" && (
          <button className={btn} onClick={() => act("start", undefined, "টাস্ক শুরু হয়েছে")}>শুরু করুন</button>
        )}
        {["ASSIGNED", "ACCEPTED", "IN_PROGRESS"].includes(stage) && !f?.reassign && (
          <button
            className={btnDanger}
            onClick={() => {
              const reason = window.prompt("কেন reassign চান? (কমপক্ষে ৩ অক্ষর)");
              if (reason) act("request-reassign", { reason }, "অনুরোধ পাঠানো হয়েছে");
            }}
          >
            Reject / Reassign চাই
          </button>
        )}
        <button className={btnGhost} onClick={() => setOpen(!open)}>{open ? "বিস্তারিত লুকান" : "বিস্তারিত"}</button>
        <button className={btnGhost} onClick={() => setWhy(!why)}>কেন আমাকে?</button>
      </div>

      {stage === "IN_PROGRESS" && (
        <div className="mt-4 rounded-lg bg-slate-50 p-4">
          <p className="mb-2 text-sm font-medium text-slate-700">Progress আপডেট: {pct0}%</p>
          <input type="range" min={0} max={100} step={5} value={pct0} onChange={(e) => setPct0(Number(e.target.value))} className="w-full accent-indigo-600" />
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={btn} onClick={() => act("progress", { percent: pct0 }, "Progress সেভ হয়েছে")}>Progress সেভ</button>
            <button
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              onClick={() => {
                const n = window.prompt("ম্যানেজারের জন্য মন্তব্য (ঐচ্ছিক)") ?? "";
                setMsg("");
                act("submit", { note: n }, "Submit করা হয়েছে, অনুমোদনের অপেক্ষা");
              }}
            >
              Submit করুন
            </button>
          </div>
        </div>
      )}

      {open && (
        <div className="mt-4 space-y-3 rounded-lg bg-slate-50 p-4 text-sm">
          <p className="text-slate-700">{t.description || "কোনো বিবরণ নেই"}</p>
          <div>
            <p className="mb-1 font-medium text-slate-700">প্রয়োজনীয় skill</p>
            <div className="flex flex-wrap gap-2">
              {t.skills.map((s) => {
                const mine = mySkill(s.skillId);
                const okLevel = mine >= s.minLevel;
                return (
                  <Badge
                    key={s.skillId}
                    text={`${s.skill.name} ≥${s.minLevel} (আমার ${mine || "—"})`}
                    cls={okLevel ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : "bg-rose-50 text-rose-700 ring-rose-600/20"}
                  />
                );
              })}
              {t.skills.length === 0 && <span className="text-slate-500">কোনো নির্দিষ্ট skill নেই</span>}
            </div>
          </div>
          <p className="text-slate-500">Assigned: {fmt(item.assignedAt)}</p>
        </div>
      )}

      {why && (
        <div className="mt-4 rounded-lg bg-slate-50 p-4">
          {manual ? (
            <p className="text-sm text-slate-600">এই টাস্ক ম্যানেজার সরাসরি আপনাকে দিয়েছেন (manual)।</p>
          ) : (
            <>
              <p className="mb-3 text-sm text-slate-600">
                উপযুক্ততার স্কোর: <b className="text-indigo-600">{(item.score * 100).toFixed(1)}</b> / 100
              </p>
              {LABELS.map(([k, label]) => <ScoreBar key={k} label={label} value={Number(item.scoreBreakdown[k] ?? 0)} />)}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TasksTab({ data, run }: { data: Data; run: Run }) {
  const [filter, setFilter] = useState<"ACTIVE" | "DONE" | "ALL">("ACTIVE");
  const rows = live(data).filter((i) => {
    const s = stageOf(i);
    return filter === "ALL" || (filter === "ACTIVE" ? isActiveStage(s) : s === "COMPLETED");
  });
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["ACTIVE", "DONE", "ALL"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${filter === f ? "bg-indigo-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}
          >
            {f}
          </button>
        ))}
      </div>
      {rows.map((i) => <TaskCard key={`${i.id}-${i.flow?.stage}`} item={i} me={data.me} run={run} />)}
      {rows.length === 0 && <p className="text-slate-500">এখানে কোনো টাস্ক নেই</p>}
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
      <p className="text-xs text-slate-400">এগুলো ডাটা থেকে সরাসরি হিসাব করা। email বা push notification এখনো নেই।</p>
    </div>
  );
}

/* ================= Performance ================= */
function PerformanceTab({ data }: { data: Data }) {
  const p = perf(data);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Performance score" value={p.score === null ? "—" : `${p.score}/100`} tone="text-indigo-600" />
        <Stat label="Completion rate" value={p.total ? pct(p.completionRate) : "—"} tone="text-emerald-600" />
        <Stat label="On-time rate" value={p.onTimeRate === null ? "—" : pct(p.onTimeRate)} />
        <Stat label="Late tasks" value={p.late.length} tone="text-rose-600" />
      </div>
      <div className={`${card} p-5 text-sm text-slate-600`}>
        <p><b>Score হিসাব:</b> ৬০% × Completion rate (সম্পন্ন ÷ আমার সব টাস্ক) + ৪০% × On-time rate (সময়মতো ÷ সময় রেকর্ড থাকা সম্পন্ন টাস্ক)।</p>
        <p className="mt-1 text-slate-400">সম্পন্নের সময় রেকর্ড না থাকলে On-time-এর জায়গায় Completion rate ধরা হয়। এটা allocation-এর স্কোর নয়, শুধু আপনার নিজের অগ্রগতি দেখার জন্য।</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className={`${card} p-5`}>
          <h3 className="mb-3 font-semibold">সম্পন্ন টাস্ক ({p.done.length})</h3>
          {p.done.length === 0 && <p className="text-sm text-slate-500">এখনো কিছু সম্পন্ন হয়নি</p>}
          <ul className="space-y-2">
            {p.done.slice(0, 8).map((i) => (
              <li key={i.id} className="flex justify-between gap-3 text-sm">
                <span className="text-slate-800">{i.task.title}</span>
                <span className="text-slate-500">{i.flow?.completedAt ? dur(i.assignedAt, i.flow.completedAt) : "সময় নেই"}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className={`${card} p-5`}>
          <h3 className="mb-3 font-semibold">দেরিতে সম্পন্ন ({p.late.length})</h3>
          {p.late.length === 0 && <p className="text-sm text-slate-500">কোনো দেরি নেই 🎉</p>}
          <ul className="space-y-2">
            {p.late.map((i) => (
              <li key={i.id} className="flex justify-between gap-3 text-sm">
                <span className="text-slate-800">{i.task.title}</span>
                <span className="text-rose-600">{dur(i.task.deadline, i.flow!.completedAt!)} দেরি</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ================= History ================= */
function HistoryTab({ data }: { data: Data }) {
  return (
    <Table head={["Task", "Assigned", "Stage", "Completed", "সময় লেগেছে", "Score", "Assignment"]}>
      {data.items.map((i) => {
        const s = stageOf(i);
        return (
          <tr key={i.id}>
            <td className="px-4 py-3 font-medium text-slate-900">{i.task.title}</td>
            <td className="whitespace-nowrap px-4 py-3 text-slate-500">{fmt(i.assignedAt)}</td>
            <td className="px-4 py-3">
              {i.active ? <Badge text={STAGE_LABEL[s]} cls={STAGE_STYLE[s]} /> : <span className="text-slate-400">—</span>}
            </td>
            <td className="whitespace-nowrap px-4 py-3 text-slate-600">{i.flow?.completedAt ? fmt(i.flow.completedAt) : "—"}</td>
            <td className="px-4 py-3 text-slate-600">{i.flow?.completedAt ? dur(i.assignedAt, i.flow.completedAt) : "—"}</td>
            <td className="px-4 py-3 font-mono text-slate-600">{i.scoreBreakdown.manual ? "—" : (i.score * 100).toFixed(1)}</td>
            <td className="px-4 py-3">
              <Badge
                text={i.active ? "Current" : "Reassigned"}
                cls={i.active ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : "bg-slate-100 text-slate-600 ring-slate-500/20"}
              />
            </td>
          </tr>
        );
      })}
      {data.items.length === 0 && <tr><td className="px-4 py-6 text-slate-500" colSpan={7}>এখনো কোনো টাস্ক দেওয়া হয়নি</td></tr>}
    </Table>
  );
}

/* ================= Availability ================= */
function AvailabilityTab({ data, run }: { data: Data; run: Run }) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const now = Date.now();
  return (
    <div className="space-y-6">
      <div className={`${card} p-5`}>
        <h3 className="mb-3 font-semibold">ছুটি যোগ করুন</h3>
        <div className="flex flex-wrap gap-2">
          <input className={inp} type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          <input className={inp} type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          <button
            className={btn}
            disabled={!start || !end}
            onClick={() =>
              run(async () => {
                await api("/availability", { method: "POST", body: { start: new Date(start).toISOString(), end: new Date(end).toISOString() } });
                setStart("");
                setEnd("");
              }, "ছুটি যোগ হয়েছে")
            }
          >
            যোগ করুন
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">ছুটি দিলে নতুন টাস্ক পাওয়ার সম্ভাবনা (Availability স্কোর) কমে।</p>
      </div>
      <Table head={["শুরু", "শেষ", "অবস্থা", ""]}>
        {data.leaves.map((l) => {
          const past = new Date(l.end).getTime() < now;
          const cur = new Date(l.start).getTime() <= now && !past;
          return (
            <tr key={l.id} className={past ? "text-slate-400" : ""}>
              <td className="px-4 py-3">{fmt(l.start)}</td>
              <td className="px-4 py-3">{fmt(l.end)}</td>
              <td className="px-4 py-3">
                <Badge
                  text={past ? "শেষ" : cur ? "চলছে" : "আসন্ন"}
                  cls={past ? "bg-slate-100 text-slate-500 ring-slate-500/20" : cur ? "bg-rose-50 text-rose-700 ring-rose-600/20" : "bg-amber-50 text-amber-700 ring-amber-600/20"}
                />
              </td>
              <td className="px-4 py-3">
                <button className={btnDanger} onClick={() => run(() => api(`/availability/${l.id}`, { method: "DELETE" }), "ছুটি মোছা হয়েছে")}>মুছুন</button>
              </td>
            </tr>
          );
        })}
        {data.leaves.length === 0 && <tr><td className="px-4 py-6 text-slate-500" colSpan={4}>কোনো ছুটি নেই</td></tr>}
      </Table>
    </div>
  );
}

/* ================= Profile ================= */
function ProfileTab({ data, run }: { data: Data; run: Run }) {
  const { me, allSkills } = data;
  const [name, setName] = useState(me.name);
  const [mine, setMine] = useState(me.skills.map((s) => ({ skillId: s.skillId, proficiency: s.proficiency })));
  const [pick, setPick] = useState<number | "">("");
  const [lvl, setLvl] = useState(3);
  const [pw, setPw] = useState({ cur: "", nw: "", cf: "" });
  const [pwErr, setPwErr] = useState("");

  useEffect(() => {
    setName(me.name);
    setMine(me.skills.map((s) => ({ skillId: s.skillId, proficiency: s.proficiency })));
  }, [me]);

  const nameOfSkill = (id: number) => allSkills.find((s) => s.id === id)?.name ?? `#${id}`;
  const available = allSkills.filter((s) => !mine.some((m) => m.skillId === s.id));
  const p = perf(data);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <div className={`${card} p-5`}>
          <h3 className="mb-4 font-semibold">আমার তথ্য</h3>
          <label className="text-xs text-slate-500">নাম
            <input className={`${inp} mt-1 w-full`} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">ইমেইল</dt><dd>{me.email}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Department</dt><dd>{me.department?.name ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Manager</dt><dd>{me.manager?.name ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">সাপ্তাহিক ক্ষমতা</dt><dd>{me.maxHoursPerWeek}h</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Performance score</dt><dd>{p.score === null ? "—" : `${p.score}/100`}</dd></div>
          </dl>
          <button
            className={`${btn} mt-4`}
            disabled={name.trim().length < 2 || name.trim() === me.name}
            onClick={() => run(async () => {
              await api("/me/profile", { method: "PATCH", body: { name: name.trim() } });
              const u = localStorage.getItem("user");
              if (u) localStorage.setItem("user", JSON.stringify({ ...JSON.parse(u), name: name.trim() }));
            }, "নাম আপডেট হয়েছে")}
          >
            সেভ করুন
          </button>
        </div>

        <div className={`${card} p-5`}>
          <h3 className="mb-4 font-semibold">পাসওয়ার্ড বদলান</h3>
          <div className="flex flex-col gap-3">
            <input className={inp} type="password" placeholder="বর্তমান পাসওয়ার্ড" value={pw.cur} onChange={(e) => setPw({ ...pw, cur: e.target.value })} />
            <input className={inp} type="password" placeholder="নতুন পাসওয়ার্ড (৮+ অক্ষর)" value={pw.nw} onChange={(e) => setPw({ ...pw, nw: e.target.value })} />
            <input className={inp} type="password" placeholder="নতুন পাসওয়ার্ড আবার" value={pw.cf} onChange={(e) => setPw({ ...pw, cf: e.target.value })} />
            {pwErr && <p className="text-sm text-rose-600">{pwErr}</p>}
            <button
              className={btn}
              disabled={!pw.cur || pw.nw.length < 8}
              onClick={() => {
                if (pw.nw !== pw.cf) return setPwErr("নতুন পাসওয়ার্ড দুটো মিলছে না");
                setPwErr("");
                run(async () => {
                  await api("/me/password", { method: "PATCH", body: { currentPassword: pw.cur, newPassword: pw.nw } });
                  setPw({ cur: "", nw: "", cf: "" });
                }, "পাসওয়ার্ড বদলানো হয়েছে");
              }}
            >
              সেভ করুন
            </button>
          </div>
        </div>
      </div>

      <div className={`${card} p-5`}>
        <h3 className="mb-1 font-semibold">আমার Skills ও level</h3>
        <p className="mb-4 text-xs text-slate-400">এই level টাস্ক বরাদ্দের স্কোরে ব্যবহার হয়, তাই সঠিকভাবে দিন। ম্যানেজার এটা যাচাই ও বদলাতে পারেন।</p>
        <ul className="space-y-2">
          {mine.map((s) => (
            <li key={s.skillId} className="flex items-center gap-2">
              <span className="flex-1 text-sm text-slate-800">{nameOfSkill(s.skillId)}</span>
              <select
                className={inp}
                value={s.proficiency}
                onChange={(e) => setMine(mine.map((m) => (m.skillId === s.skillId ? { ...m, proficiency: Number(e.target.value) } : m)))}
              >
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}/5</option>)}
              </select>
              <button className={btnDanger} onClick={() => setMine(mine.filter((m) => m.skillId !== s.skillId))}>×</button>
            </li>
          ))}
          {mine.length === 0 && <li className="text-sm text-slate-500">কোনো skill সেট নেই</li>}
        </ul>
        <div className="mt-4 flex gap-2">
          <select className={`${inp} flex-1`} value={pick} onChange={(e) => setPick(e.target.value === "" ? "" : Number(e.target.value))}>
            <option value="">Skill যোগ করুন…</option>
            {available.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className={inp} value={lvl} onChange={(e) => setLvl(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}/5</option>)}
          </select>
          <button
            className={btnGhost}
            disabled={pick === ""}
            onClick={() => {
              if (pick === "") return;
              setMine([...mine, { skillId: Number(pick), proficiency: lvl }]);
              setPick("");
            }}
          >
            যোগ
          </button>
        </div>
        <button className={`${btn} mt-4`} onClick={() => run(() => api("/me/skills", { method: "PUT", body: { skills: mine } }), "Skills সেভ হয়েছে")}>
          Skills সেভ করুন
        </button>
        {allSkills.length === 0 && <p className="mt-3 text-xs text-slate-400">সিস্টেমে এখনো কোনো skill নেই। ম্যানেজার যোগ করলে এখানে আসবে।</p>}
      </div>
    </div>
  );
}

/* ================= Shell ================= */
export default function MemberApp({ user, onLogout }: { user: { name: string }; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<Data | null>(null);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");

  async function load() {
    setData(await api<Data>("/me/overview"));
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

  const notes = useMemo(() => (data ? buildNotes(data) : []), [data]);
  const alerts = notes.filter((n) => n.tone !== "ok").length;
  const nav = NAV.map(([id, label]) => [id, id === "notifications" && alerts > 0 ? `${label} (${alerts})` : label] as const);

  return (
    <Shell nav={nav} tab={tab} onTab={setTab} user={user} roleLabel="Member" onLogout={onLogout}>
      <Notice msg={msg} ok={ok} />
      {!data ? (
        <p className="text-slate-500">লোড হচ্ছে…</p>
      ) : (
        <>
          {tab === "overview" && <Overview data={data} notes={notes} go={setTab} />}
          {tab === "tasks" && <TasksTab data={data} run={run} />}
          {tab === "notifications" && <NotificationsTab notes={notes} />}
          {tab === "performance" && <PerformanceTab data={data} />}
          {tab === "history" && <HistoryTab data={data} />}
          {tab === "availability" && <AvailabilityTab data={data} run={run} />}
          {tab === "profile" && <ProfileTab data={data} run={run} />}
        </>
      )}
    </Shell>
  );
}