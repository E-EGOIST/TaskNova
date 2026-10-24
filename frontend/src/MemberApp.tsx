import { useEffect, useState } from "react";
import { api } from "./api";
import LeavePanel from "./Leave";
import {
  Badge, Bar, Notice, PRIORITY_STYLE, STATUS_STYLE, ScoreBar, Shell, Stat,
  btn, btnGhost, card, fmt, inp, isOpen, isOverdue, pct,
} from "./ui";

type Skill = { id: number; name: string };
type Me = {
  name: string; email: string; role: string; maxHoursPerWeek: number;
  department: { name: string } | null;
  manager: { name: string } | null;
  skills: { skillId: number; proficiency: number; skill: Skill }[];
};
type Task = { id: number; title: string; priority: string; estimatedHours: number; deadline: string; status: string };
type Mine = { id: number; score: number; scoreBreakdown: Record<string, number | boolean>; assignedAt: string; task: Task };

const NAV = [
  ["tasks", "My tasks"],
  ["leave", "Leave"],
  ["profile", "Profile"],
] as const;
type Tab = (typeof NAV)[number][0];

const LABELS: [string, string][] = [
  ["skillMatch", "Skill match (50%)"],
  ["workload", "Workload (25%)"],
  ["availability", "Availability (15%)"],
  ["experience", "Experience (10%)"],
];

export default function MemberApp({ user, onLogout }: { user: { name: string }; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("tasks");
  const [me, setMe] = useState<Me | null>(null);
  const [items, setItems] = useState<Mine[]>([]);
  const [filter, setFilter] = useState<"ACTIVE" | "DONE" | "ALL">("ACTIVE");
  const [open, setOpen] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");
  const [pw, setPw] = useState({ cur: "", nw: "", cf: "" });

  async function load() {
    const [m, t] = await Promise.all([api<Me>("/me"), api<Mine[]>("/tasks/mine")]);
    setMe(m);
    setItems(t);
  }
  useEffect(() => {
    load().catch((e) => setMsg(e.message));
  }, []);

  async function setStatus(id: number, status: string) {
    setMsg("");
    setOk("");
    try {
      await api(`/tasks/${id}/status`, { method: "PATCH", body: { status } });
      await load();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  async function changePassword() {
    setMsg("");
    setOk("");
    if (pw.nw !== pw.cf) return setMsg("নতুন পাসওয়ার্ড দুটো মিলছে না");
    try {
      await api("/me/password", { method: "PATCH", body: { currentPassword: pw.cur, newPassword: pw.nw } });
      setPw({ cur: "", nw: "", cf: "" });
      setOk("পাসওয়ার্ড বদলানো হয়েছে");
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  const activeItems = items.filter((i) => ["ASSIGNED", "IN_PROGRESS"].includes(i.task.status));
  const hours = activeItems.reduce((s, i) => s + i.task.estimatedHours, 0);
  const cap = me?.maxHoursPerWeek ?? 40;
  const done = items.filter((i) => i.task.status === "DONE").length;
  const overdue = items.filter((i) => isOverdue(i.task)).length;
  const rows = items.filter(
    (i) => filter === "ALL" || (filter === "ACTIVE" ? isOpen(i.task) : i.task.status === "DONE")
  );

  return (
    <Shell nav={NAV} tab={tab} onTab={setTab} user={user} roleLabel="Member" onLogout={onLogout}>
      <Notice msg={msg} ok={ok} />

      {tab === "tasks" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Active" value={activeItems.length} tone="text-indigo-600" />
            <Stat label="Completed" value={done} tone="text-emerald-600" />
            <Stat label="Overdue" value={overdue} tone="text-rose-600" />
            <Stat label="Hours" value={`${hours}h / ${cap}h`} />
          </div>
          <div className={`${card} p-5`}>
            <Bar label="আমার workload" value={hours / cap} right={`${pct(hours / cap)} ব্যবহৃত`} />
          </div>

          <div className="flex gap-2">
            {(["ACTIVE", "DONE", "ALL"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  filter === f ? "bg-indigo-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {rows.map((i) => {
              const t = i.task;
              const manual = i.scoreBreakdown.manual === true;
              return (
                <div key={i.id} className={`${card} p-4`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-900">{t.title}</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {t.estimatedHours}h ·{" "}
                        <span className={isOverdue(t) ? "text-rose-600" : ""}>Deadline: {fmt(t.deadline)}</span>
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="flex gap-2">
                        <Badge text={t.priority} cls={PRIORITY_STYLE[t.priority]} />
                        <Badge text={t.status} cls={STATUS_STYLE[t.status]} />
                      </div>
                      <div className="flex gap-2">
                        <button className={btnGhost} onClick={() => setOpen(open === i.id ? null : i.id)}>
                          কেন আমাকে?
                        </button>
                        {t.status === "ASSIGNED" && (
                          <button className={btn} onClick={() => setStatus(t.id, "IN_PROGRESS")}>শুরু করুন</button>
                        )}
                        {t.status === "IN_PROGRESS" && (
                          <button className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700" onClick={() => setStatus(t.id, "DONE")}>
                            শেষ
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {open === i.id && (
                    <div className="mt-4 rounded-lg bg-slate-50 p-4">
                      {manual ? (
                        <p className="text-sm text-slate-600">এই টাস্ক ম্যানেজার সরাসরি আপনাকে দিয়েছেন (manual)।</p>
                      ) : (
                        <>
                          <p className="mb-3 text-sm text-slate-600">
                            উপযুক্ততার স্কোর: <b className="text-indigo-600">{(i.score * 100).toFixed(1)}</b> / 100
                          </p>
                          {LABELS.map(([k, label]) => (
                            <ScoreBar key={k} label={label} value={Number(i.scoreBreakdown[k] ?? 0)} />
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {rows.length === 0 && <p className="text-slate-500">এখানে কোনো টাস্ক নেই</p>}
          </div>
        </div>
      )}

      {tab === "leave" && <LeavePanel />}

      {tab === "profile" && me && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className={`${card} p-5`}>
            <h3 className="mb-4 font-semibold">আমার তথ্য</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">নাম</dt><dd>{me.name}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">ইমেইল</dt><dd>{me.email}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Department</dt><dd>{me.department?.name ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Manager</dt><dd>{me.manager?.name ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">সাপ্তাহিক ক্ষমতা</dt><dd>{me.maxHoursPerWeek}h</dd></div>
            </dl>
            <h4 className="mb-2 mt-5 text-sm font-semibold">আমার Skills</h4>
            <div className="flex flex-wrap gap-2">
              {me.skills.map((s) => (
                <Badge key={s.skillId} text={`${s.skill.name} ${s.proficiency}/5`} cls="bg-indigo-50 text-indigo-700 ring-indigo-600/20" />
              ))}
              {me.skills.length === 0 && <p className="text-sm text-slate-500">কোনো skill সেট নেই। ম্যানেজারকে বলুন।</p>}
            </div>
          </div>

          <div className={`${card} p-5`}>
            <h3 className="mb-4 font-semibold">পাসওয়ার্ড বদলান</h3>
            <div className="flex flex-col gap-3">
              <input className={inp} type="password" placeholder="বর্তমান পাসওয়ার্ড" value={pw.cur} onChange={(e) => setPw({ ...pw, cur: e.target.value })} />
              <input className={inp} type="password" placeholder="নতুন পাসওয়ার্ড (৮+ অক্ষর)" value={pw.nw} onChange={(e) => setPw({ ...pw, nw: e.target.value })} />
              <input className={inp} type="password" placeholder="নতুন পাসওয়ার্ড আবার" value={pw.cf} onChange={(e) => setPw({ ...pw, cf: e.target.value })} />
              <button className={btn} disabled={!pw.cur || pw.nw.length < 8} onClick={changePassword}>সেভ করুন</button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}