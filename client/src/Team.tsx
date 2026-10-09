import { useEffect, useState } from "react";
import { api } from "./api";

type Skill = { id: number; name: string };
type Member = {
  id: number;
  name: string;
  email: string;
  role: string;
  skills: { skillId: number; proficiency: number; skill: Skill }[];
};

export default function Team() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [newSkill, setNewSkill] = useState("");
  const [msg, setMsg] = useState("");
  // কোন member-এর জন্য কী skill বেছে নেওয়া হচ্ছে
  const [pick, setPick] = useState<Record<number, { skillId: number | ""; level: number }>>({});

  async function load() {
    setSkills(await api<Skill[]>("/skills"));
    const users = await api<Member[]>("/users");
    setMembers(users.filter((u) => u.role === "MEMBER"));
  }
  useEffect(() => {
    load().catch((e) => setMsg(e.message));
  }, []);

  async function addSkill() {
    setMsg("");
    try {
      await api("/skills", { method: "POST", body: { name: newSkill.trim() } });
      setNewSkill("");
      await load();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  // সম্পূর্ণ skill তালিকা পাঠাতে হয় (backend পুরোনোগুলো মুছে নতুন বসায়)
  async function saveSkills(m: Member, list: { skillId: number; proficiency: number }[]) {
    setMsg("");
    try {
      await api(`/users/${m.id}/skills`, { method: "PUT", body: { skills: list } });
      await load();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  function addToMember(m: Member) {
    const p = pick[m.id];
    if (!p || p.skillId === "") return;
    const current = m.skills.map((s) => ({ skillId: s.skillId, proficiency: s.proficiency }));
    const without = current.filter((s) => s.skillId !== p.skillId);
    saveSkills(m, [...without, { skillId: Number(p.skillId), proficiency: p.level }]);
  }

  function removeFromMember(m: Member, skillId: number) {
    const rest = m.skills
      .filter((s) => s.skillId !== skillId)
      .map((s) => ({ skillId: s.skillId, proficiency: s.proficiency }));
    saveSkills(m, rest);
  }

  return (
    <div>
      {msg && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{msg}</p>}

      <div className="mb-6 rounded-lg bg-white p-4 shadow">
        <h2 className="mb-3 font-semibold">Skills</h2>
        <div className="mb-3 flex flex-wrap gap-2">
          {skills.map((s) => (
            <span key={s.id} className="rounded bg-indigo-50 px-2 py-1 text-sm text-indigo-700">
              {s.name}
            </span>
          ))}
          {skills.length === 0 && <span className="text-gray-500">কোনো skill নেই</span>}
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded border p-2"
            placeholder="নতুন skill (যেমন Node.js)"
            value={newSkill}
            onChange={(e) => setNewSkill(e.target.value)}
          />
          <button
            onClick={addSkill}
            disabled={!newSkill.trim()}
            className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
          >
            যোগ
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {members.map((m) => (
          <div key={m.id} className="rounded-lg bg-white p-4 shadow">
            <h3 className="font-semibold">
              {m.name} <span className="text-sm font-normal text-gray-500">{m.email}</span>
            </h3>
            <div className="my-2 flex flex-wrap gap-2">
              {m.skills.map((s) => (
                <span key={s.skillId} className="rounded bg-green-50 px-2 py-1 text-sm text-green-700">
                  {s.skill.name} · {s.proficiency}/5
                  <button onClick={() => removeFromMember(m, s.skillId)} className="ml-2 text-red-600">
                    ×
                  </button>
                </span>
              ))}
              {m.skills.length === 0 && <span className="text-sm text-gray-500">কোনো skill সেট করা নেই</span>}
            </div>
            <div className="flex gap-2">
              <select
                className="flex-1 rounded border p-2"
                value={pick[m.id]?.skillId ?? ""}
                onChange={(e) =>
                  setPick((p) => ({
                    ...p,
                    [m.id]: { skillId: e.target.value === "" ? "" : Number(e.target.value), level: p[m.id]?.level ?? 3 },
                  }))
                }
              >
                <option value="">Skill বাছুন</option>
                {skills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <input
                className="w-16 rounded border p-2"
                type="number"
                min={1}
                max={5}
                value={pick[m.id]?.level ?? 3}
                onChange={(e) =>
                  setPick((p) => ({
                    ...p,
                    [m.id]: { skillId: p[m.id]?.skillId ?? "", level: Number(e.target.value) },
                  }))
                }
              />
              <button onClick={() => addToMember(m)} className="rounded bg-green-600 px-3 py-2 text-white">
                সেট
              </button>
            </div>
          </div>
        ))}
        {members.length === 0 && <p className="text-gray-500">কোনো member নেই</p>}
      </div>
    </div>
  );
}