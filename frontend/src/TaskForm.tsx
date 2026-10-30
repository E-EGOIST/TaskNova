import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { SKILL_CATALOG } from "./skillCatalog";
import { btn, btnGhost, card, inp } from "./ui";

export type Skill = { id: number; name: string };
export type Picked = { skillId: number; minLevel: number };
type Run = (fn: () => Promise<unknown>, success?: string) => Promise<void>;

export type TaskFormValue = {
  id: number; title: string; description: string; hours: number; deadline: string;
  priority: string; difficulty: number; category: string; skills: Picked[];
};

export const emptyTask: TaskFormValue = {
  id: 0, title: "", description: "", hours: 8, deadline: "", priority: "MEDIUM", difficulty: 3, category: "", skills: [],
};

/* ================= Skill picker ================= */
export function SkillPicker({
  skills, value, onChange, run,
}: {
  skills: Skill[];
  value: Picked[];
  onChange: (v: Picked[]) => void;
  run: Run;
}) {
  const [cat, setCat] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const tried = useRef(false);

  const byName = useMemo(() => new Map(skills.map((s) => [s.name.toLowerCase(), s])), [skills]);
  const catalogNames = useMemo(() => Array.from(new Set(SKILL_CATALOG.flatMap((c) => c.skills))), []);
  const missing = useMemo(
    () => catalogNames.filter((n) => !byName.has(n.toLowerCase())),
    [catalogNames, byName]
  );

  // ক্যাটালগের যে skill ডাটাবেসে নেই, একবার নিজে থেকে যোগ হবে
  useEffect(() => {
    if (missing.length > 0 && !tried.current) {
      tried.current = true;
      run(() => api("/skills/bulk", { method: "POST", body: { names: missing } }));
    }
  }, [missing, run]);

  const cats = useMemo(() => {
    const known = new Set(catalogNames.map((n) => n.toLowerCase()));
    const list = SKILL_CATALOG.map((c) => ({
      name: c.category,
      items: Array.from(new Set(c.skills))
        .map((n) => byName.get(n.toLowerCase()))
        .filter((s): s is Skill => !!s),
    }));
    const others = skills.filter((s) => !known.has(s.name.toLowerCase()));
    if (others.length > 0) list.push({ name: "অন্যান্য / কাস্টম", items: others });
    return list;
  }, [byName, catalogNames, skills]);

  const picked = useMemo(() => new Map(value.map((v) => [v.skillId, v])), [value]);
  const nameOf = (id: number) => skills.find((s) => s.id === id)?.name ?? `#${id}`;
  const term = q.trim().toLowerCase();
  const exact = term !== "" && byName.has(term);
  const shown: Skill[] = term
    ? skills.filter((s) => s.name.toLowerCase().includes(term)).slice(0, 40)
    : cats.find((c) => c.name === cat)?.items ?? [];

  function toggle(s: Skill) {
    if (picked.has(s.id)) onChange(value.filter((v) => v.skillId !== s.id));
    else onChange([...value, { skillId: s.id, minLevel: 3 }]);
  }
  function setLevel(id: number, minLevel: number) {
    onChange(value.map((v) => (v.skillId === id ? { ...v, minLevel } : v)));
  }

  // তালিকায় না থাকলে নতুন skill লিখে যোগ করা
  function addCustom() {
    const name = q.trim();
    if (!name) return;
    const hit = byName.get(name.toLowerCase());
    if (hit) {
      if (!picked.has(hit.id)) onChange([...value, { skillId: hit.id, minLevel: 3 }]);
      setQ("");
      return;
    }
    run(async () => {
      const s = await api<Skill>("/skills", { method: "POST", body: { name } });
      onChange([...value, { skillId: s.id, minLevel: 3 }]);
      setQ("");
    }, `"${name}" skill যোগ হয়েছে`);
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500">Required skills ({value.length}টি বাছাই করা)</p>
        {missing.length > 0 && <span className="text-xs text-slate-400">skill তালিকা তৈরি হচ্ছে…</span>}
      </div>

      {value.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {value.map((v) => (
            <span
              key={v.skillId}
              className="inline-flex items-center gap-1 rounded-full bg-indigo-50 py-1 pl-3 pr-1 text-xs text-indigo-700 ring-1 ring-inset ring-indigo-600/20"
            >
              {nameOf(v.skillId)}
              <select
                className="rounded border border-indigo-200 bg-white px-1 text-xs"
                value={v.minLevel}
                onChange={(e) => setLevel(v.skillId, Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>≥{n}</option>)}
              </select>
              <button
                type="button"
                className="rounded-full px-2 text-rose-600 hover:bg-rose-50"
                onClick={() => onChange(value.filter((x) => x.skillId !== v.skillId))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="mb-3 flex gap-2">
        <input
          className={`${inp} flex-1`}
          placeholder="Skill খুঁজুন, না পেলে নতুন নাম লিখে যোগ করুন"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
        />
        {term !== "" && !exact && (
          <button type="button" className={btn} onClick={addCustom}>
            + "{q.trim()}" যোগ করুন
          </button>
        )}
      </div>

      {!term && (
        <div className="mb-3 flex flex-wrap gap-2">
          {cats.map((c) => (
            <button
              key={c.name}
              type="button"
              onClick={() => setCat(cat === c.name ? null : c.name)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                cat === c.name ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {c.name} ({c.items.length})
            </button>
          ))}
        </div>
      )}

      {!term && !cat && <p className="text-xs text-slate-400">একটি category বাছুন (যেমন Frontend), অথবা ওপরে skill খুঁজুন।</p>}
      {term !== "" && shown.length === 0 && <p className="text-xs text-slate-400">এই নামে কোনো skill নেই, ওপরের বাটনে চাপলে নতুন হিসেবে যোগ হবে।</p>}

      <div className="flex flex-wrap gap-2">
        {shown.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => toggle(s)}
            className={`rounded-full px-3 py-1 text-xs ${
              picked.has(s.id) ? "bg-indigo-600 text-white" : `${btnGhost} !rounded-full !px-3 !py-1`
            }`}
          >
            {picked.has(s.id) ? "✓ " : ""}{s.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ================= Task form (Admin ও Manager দুজনেরই এক) ================= */
export default function TaskForm({
  value, onChange, skills, endpoint, run, onDone,
}: {
  value: TaskFormValue;
  onChange: (v: TaskFormValue) => void;
  skills: Skill[];
  endpoint: string; // "/admin/tasks" বা "/manager/tasks"
  run: Run;
  onDone: () => void;
}) {
  const f = value;
  const set = (patch: Partial<TaskFormValue>) => onChange({ ...f, ...patch });

  function save() {
    const body = {
      title: f.title.trim(),
      description: f.description.trim() || null,
      estimatedHours: Number(f.hours),
      deadline: new Date(f.deadline).toISOString(),
      priority: f.priority,
      difficulty: Math.max(1, Math.min(5, Number(f.difficulty) || 3)),
      category: f.category.trim() || null,
      skills: f.skills.map((s) => ({ skillId: s.skillId, minLevel: s.minLevel })),
    };
    run(async () => {
      if (f.id) await api(`${endpoint}/${f.id}`, { method: "PATCH", body });
      else await api(endpoint, { method: "POST", body });
      onDone();
    }, f.id ? "টাস্ক আপডেট হয়েছে" : "টাস্ক তৈরি হয়েছে");
  }

  return (
    <div className={`${card} grid gap-3 p-4 md:grid-cols-3`}>
      <input className={`${inp} md:col-span-3`} placeholder="Title" value={f.title} onChange={(e) => set({ title: e.target.value })} />
      <textarea className={`${inp} md:col-span-3`} rows={2} placeholder="বিবরণ (ঐচ্ছিক)" value={f.description} onChange={(e) => set({ description: e.target.value })} />
      <label className="text-xs text-slate-500">Estimated hours
        <input className={`${inp} mt-1 w-full`} type="number" min={1} value={f.hours} onChange={(e) => set({ hours: Number(e.target.value) })} />
      </label>
      <label className="text-xs text-slate-500">Deadline
        <input className={`${inp} mt-1 w-full`} type="datetime-local" value={f.deadline} onChange={(e) => set({ deadline: e.target.value })} />
      </label>
      <label className="text-xs text-slate-500">Priority
        <select className={`${inp} mt-1 w-full`} value={f.priority} onChange={(e) => set({ priority: e.target.value })}>
          {["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => <option key={p}>{p}</option>)}
        </select>
      </label>
      <label className="text-xs text-slate-500">Difficulty (1-5)
        <input className={`${inp} mt-1 w-full`} type="number" min={1} max={5} value={f.difficulty} onChange={(e) => set({ difficulty: Number(e.target.value) })} />
      </label>
      <label className="text-xs text-slate-500 md:col-span-2">Category
        <input className={`${inp} mt-1 w-full`} list="task-categories" placeholder="যেমন Frontend" value={f.category} onChange={(e) => set({ category: e.target.value })} />
        <datalist id="task-categories">
          {SKILL_CATALOG.map((c) => <option key={c.category} value={c.category} />)}
        </datalist>
      </label>

      <div className="md:col-span-3">
        <SkillPicker skills={skills} value={f.skills} onChange={(v) => set({ skills: v })} run={run} />
      </div>

      <div className="md:col-span-3">
        <button className={btn} disabled={f.title.trim().length < 2 || !f.deadline || f.hours <= 0} onClick={save}>
          {f.id ? "আপডেট করুন" : "তৈরি করুন"}
        </button>
      </div>
    </div>
  );
}