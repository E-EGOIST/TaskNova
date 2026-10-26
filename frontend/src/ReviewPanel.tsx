import { useEffect, useState } from "react";
import { api } from "./api";
import { Badge, Notice, btn, btnDanger, btnGhost, card, fmt, inp } from "./ui";

type Person = { id: number; name: string };
type Submitted = {
  taskId: number; title: string; deadline: string; estimatedHours: number;
  assignee: Person; submittedAt: string | null; note: string | null;
};
type Request = {
  taskId: number; title: string; deadline: string; estimatedHours: number;
  assignee: Person; reason: string; at: string; stage: string;
};
type Data = { submitted: Submitted[]; requests: Request[]; members: Person[] };

export default function ReviewPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");
  const [notes, setNotes] = useState<Record<number, string>>({});

  async function load() {
    setData(await api<Data>("/manager/reviews"));
  }
  useEffect(() => {
    load().catch((e) => setMsg(e.message));
  }, []);

  async function run(fn: () => Promise<unknown>, success: string) {
    setMsg("");
    setOk("");
    try {
      await fn();
      setOk(success);
      await load();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  if (!data) {
    return (
      <>
        <Notice msg={msg} ok={ok} />
        <p className="text-slate-500">লোড হচ্ছে…</p>
      </>
    );
  }

  return (
    <div className="space-y-6">
      <Notice msg={msg} ok={ok} />

      <div className={`${card} p-5`}>
        <h3 className="mb-3 font-semibold">Submit করা টাস্ক ({data.submitted.length})</h3>
        {data.submitted.length === 0 && <p className="text-sm text-slate-500">review-এর অপেক্ষায় কোনো টাস্ক নেই 🎉</p>}
        <div className="space-y-3">
          {data.submitted.map((s) => (
            <div key={s.taskId} className="rounded-lg border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-900">{s.title}</p>
                  <p className="text-sm text-slate-500">
                    {s.assignee.name} · {s.estimatedHours}h · Deadline: {fmt(s.deadline)}
                  </p>
                  {s.submittedAt && <p className="text-xs text-slate-400">Submit: {fmt(s.submittedAt)}</p>}
                </div>
                <Badge text="Submitted" cls="bg-violet-50 text-violet-700 ring-violet-600/20" />
              </div>
              {s.note && <p className="mt-2 rounded bg-slate-50 p-2 text-sm text-slate-700">মন্তব্য: {s.note}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  className={`${inp} flex-1`}
                  placeholder="মন্তব্য (ফেরত দিলে কারণ লিখুন)"
                  value={notes[s.taskId] ?? ""}
                  onChange={(e) => setNotes({ ...notes, [s.taskId]: e.target.value })}
                />
                <button
                  className={btn}
                  onClick={() => run(() => api(`/manager/tasks/${s.taskId}/review`, { method: "POST", body: { decision: "APPROVE", note: notes[s.taskId] ?? "" } }), "অনুমোদন করা হয়েছে, টাস্ক সম্পন্ন")}
                >
                  Approve
                </button>
                <button
                  className={btnDanger}
                  disabled={!(notes[s.taskId] ?? "").trim()}
                  onClick={() => run(() => api(`/manager/tasks/${s.taskId}/review`, { method: "POST", body: { decision: "REJECT", note: notes[s.taskId] } }), "ফেরত দেওয়া হয়েছে")}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={`${card} p-5`}>
        <h3 className="mb-3 font-semibold">Reassign অনুরোধ ({data.requests.length})</h3>
        {data.requests.length === 0 && <p className="text-sm text-slate-500">কোনো অনুরোধ নেই</p>}
        <div className="space-y-3">
          {data.requests.map((r) => (
            <div key={r.taskId} className="rounded-lg border border-slate-200 p-4">
              <p className="font-medium text-slate-900">{r.title}</p>
              <p className="text-sm text-slate-500">
                {r.assignee.name} · {r.estimatedHours}h · Deadline: {fmt(r.deadline)} · {fmt(r.at)}
              </p>
              <p className="mt-2 rounded bg-amber-50 p-2 text-sm text-amber-800">কারণ: {r.reason}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <select
                  className={inp}
                  value=""
                  onChange={(e) =>
                    e.target.value &&
                    run(() => api(`/manager/tasks/${r.taskId}/assign`, { method: "POST", body: { userId: Number(e.target.value) } }), "Reassign হয়েছে")
                  }
                >
                  <option value="">অন্য member-কে দিন…</option>
                  {data.members.filter((m) => m.id !== r.assignee.id).map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                <button
                  className={btnGhost}
                  onClick={() => {
                    const note = window.prompt("কেন অনুরোধ গ্রহণ হচ্ছে না? (ঐচ্ছিক)") ?? "";
                    run(() => api(`/manager/tasks/${r.taskId}/decline-reassign`, { method: "POST", body: { note } }), "অনুরোধ গ্রহণ করা হয়নি");
                  }}
                >
                  গ্রহণ করব না
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}