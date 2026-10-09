import LeavePanel from "./Leave";
import { useEffect, useState } from "react";
import { api } from "./api";

type Skill = { id: number; name: string };
type Task = {
  id: number;
  title: string;
  priority: string;
  estimatedHours: number;
  deadline: string;
  status: string;
  skills: { skillId: number; minLevel: number; skill: Skill }[];
};
type Suggestion = {
  userId: number;
  name: string;
  score: number;
  breakdown: {
    skillMatch: number;
    workload: number;
    availability: number;
    experience: number;
  };
};
type MyAssignment = { id: number; score: number; task: Task };

const LABELS: Record<string, string> = {
  skillMatch: "Skill (50%)",
  workload: "Workload (25%)",
  availability: "Availability (15%)",
  experience: "Experience (10%)",
};

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="mb-1">
      <div className="flex justify-between text-xs text-gray-600">
        <span>{label}</span>
        <span>{(value * 100).toFixed(0)}%</span>
      </div>
      <div className="h-2 rounded bg-gray-200">
        <div className="h-2 rounded bg-blue-500" style={{ width: `${value * 100}%` }} />
      </div>
    </div>
  );
}

/* ---------- Manager / Admin ---------- */
function ManagerView() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [suggestions, setSuggestions] = useState<Record<number, Suggestion[]>>({});
  const [msg, setMsg] = useState("");

  const [title, setTitle] = useState("");
  const [hours, setHours] = useState(8);
  const [deadline, setDeadline] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [skillId, setSkillId] = useState<number | "">("");
  const [minLevel, setMinLevel] = useState(3);

  async function load() {
    setTasks(await api<Task[]>("/tasks"));
    setSkills(await api<Skill[]>("/skills"));
  }
  useEffect(() => {
    load().catch((e) => setMsg(e.message));
  }, []);

  async function createTask() {
    setMsg("");
    try {
      await api("/tasks", {
        method: "POST",
        body: {
          title,
          estimatedHours: Number(hours),
          priority,
          deadline: new Date(deadline).toISOString(),
          skills: skillId === "" ? [] : [{ skillId: Number(skillId), minLevel: Number(minLevel) }],
        },
      });
      setTitle("");
      await load();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  async function suggest(id: number) {
    setMsg("");
    try {
      const s = await api<Suggestion[]>(`/tasks/${id}/suggestions`);
      setSuggestions((p) => ({ ...p, [id]: s }));
      if (s.length === 0) setMsg("কোনো যোগ্য সদস্য পাওয়া যায়নি");
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  async function assign(taskId: number, userId: number) {
    setMsg("");
    try {
      await api(`/tasks/${taskId}/assign`, { method: "POST", body: { userId } });
      setSuggestions((p) => ({ ...p, [taskId]: [] }));
      await load();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  return (
    <div>
      <div className="mb-6 rounded-lg bg-white p-4 shadow">
        <h2 className="mb-3 font-semibold">নতুন টাস্ক</h2>
        <div className="grid grid-cols-2 gap-3">
          <input className="col-span-2 rounded border p-2" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className="rounded border p-2" type="number" min={1} value={hours} onChange={(e) => setHours(Number(e.target.value))} />
          <input className="rounded border p-2" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          <select className="rounded border p-2" value={priority} onChange={(e) => setPriority(e.target.value)}>
            {["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => <option key={p}>{p}</option>)}
          </select>
          <div className="flex gap-2">
            <select className="flex-1 rounded border p-2" value={skillId} onChange={(e) => setSkillId(e.target.value === "" ? "" : Number(e.target.value))}>
              <option value="">Skill (ঐচ্ছিক)</option>
              {skills.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input className="w-16 rounded border p-2" type="number" min={1} max={5} value={minLevel} onChange={(e) => setMinLevel(Number(e.target.value))} />
          </div>
        </div>
        <button onClick={createTask} disabled={!title || !deadline} className="mt-3 rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50">
          টাস্ক তৈরি
        </button>
      </div>

      {msg && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{msg}</p>}

      <div className="space-y-4">
        {tasks.map((t) => (
          <div key={t.id} className="rounded-lg bg-white p-4 shadow">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold">{t.title}</h3>
                <p className="text-sm text-gray-600">
                  {t.priority} · {t.estimatedHours}h · Deadline: {new Date(t.deadline).toLocaleString()}
                </p>
                <p className="text-sm text-gray-600">
                  Skills: {t.skills.map((s) => `${s.skill.name} (≥${s.minLevel})`).join(", ") || "নেই"}
                </p>
              </div>
              <div className="text-right">
                <span className="rounded bg-gray-100 px-2 py-1 text-xs">{t.status}</span>
                {t.status === "PENDING" && (
                  <button onClick={() => suggest(t.id)} className="mt-2 block rounded bg-indigo-600 px-3 py-1 text-sm text-white">
                    Suggest
                  </button>
                )}
              </div>
            </div>

            {(suggestions[t.id] ?? []).length > 0 && (
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {suggestions[t.id].map((s, i) => (
                  <div key={s.userId} className="rounded border p-3">
                    <div className="mb-2 flex justify-between">
                      <span className="font-semibold">#{i + 1} {s.name}</span>
                      <span className="font-mono text-sm">{(s.score * 100).toFixed(1)}</span>
                    </div>
                    {(Object.keys(LABELS) as (keyof Suggestion["breakdown"])[]).map((k) => (
                      <Bar key={k} label={LABELS[k]} value={s.breakdown[k]} />
                    ))}
                    <button onClick={() => assign(t.id, s.userId)} className="mt-2 w-full rounded bg-green-600 py-1 text-sm text-white">
                      Assign
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {tasks.length === 0 && <p className="text-gray-500">কোনো টাস্ক নেই</p>}
      </div>
    </div>
  );
}

/* ---------- Member ---------- */
function MemberView() {
  const [items, setItems] = useState<MyAssignment[]>([]);
  const [msg, setMsg] = useState("");

  async function load() {
    setItems(await api<MyAssignment[]>("/tasks/mine"));
  }
  useEffect(() => {
    load().catch((e) => setMsg(e.message));
  }, []);

  async function setStatus(id: number, status: string) {
    setMsg("");
    try {
      await api(`/tasks/${id}/status`, { method: "PATCH", body: { status } });
      await load();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      {msg && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{msg}</p>}
      {items.map(({ id, task }) => (
        <div key={id} className="flex items-center justify-between rounded-lg bg-white p-4 shadow">
          <div>
            <h3 className="font-semibold">{task.title}</h3>
            <p className="text-sm text-gray-600">
              {task.priority} · {task.estimatedHours}h · Deadline: {new Date(task.deadline).toLocaleString()}
            </p>
            <span className="rounded bg-gray-100 px-2 py-1 text-xs">{task.status}</span>
          </div>
          <div>
            {task.status === "ASSIGNED" && (
              <button onClick={() => setStatus(task.id, "IN_PROGRESS")} className="rounded bg-blue-600 px-3 py-1 text-sm text-white">
                শুরু করুন
              </button>
            )}
            {task.status === "IN_PROGRESS" && (
              <button onClick={() => setStatus(task.id, "DONE")} className="rounded bg-green-600 px-3 py-1 text-sm text-white">
                শেষ
              </button>
            )}
          </div>
        </div>
      ))}
      {items.length === 0 && <p className="text-gray-500">আপনাকে কোনো টাস্ক দেওয়া হয়নি</p>}
    </div>
  );
}

export default function Dashboard({ role }: { role: string }) {
  if (role === "MEMBER") {
    return (
      <div>
        <MemberView />
        <LeavePanel />
      </div>
    );
  }
  return <ManagerView />;
}