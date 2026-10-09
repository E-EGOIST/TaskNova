import { useEffect, useState } from "react";
import { api } from "./api";

type Leave = { id: number; start: string; end: string };

export default function LeavePanel() {
  const [list, setList] = useState<Leave[]>([]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    setList(await api<Leave[]>("/availability"));
  }
  useEffect(() => {
    load().catch((e) => setMsg(e.message));
  }, []);

  async function add() {
    setMsg("");
    try {
      await api("/availability", {
        method: "POST",
        body: { start: new Date(start).toISOString(), end: new Date(end).toISOString() },
      });
      setStart("");
      setEnd("");
      await load();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  async function remove(id: number) {
    try {
      await api(`/availability/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  return (
    <div className="mt-8 rounded-lg bg-white p-4 shadow">
      <h2 className="mb-3 font-semibold">আমার ছুটি</h2>
      {msg && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{msg}</p>}
      <div className="mb-3 flex flex-wrap gap-2">
        <input className="rounded border p-2" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
        <input className="rounded border p-2" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
        <button
          onClick={add}
          disabled={!start || !end}
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          ছুটি যোগ
        </button>
      </div>
      <ul className="space-y-2">
        {list.map((l) => (
          <li key={l.id} className="flex items-center justify-between rounded bg-gray-50 p-2 text-sm">
            <span>
              {new Date(l.start).toLocaleString()} → {new Date(l.end).toLocaleString()}
            </span>
            <button onClick={() => remove(l.id)} className="text-red-600">
              মুছুন
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="text-gray-500">কোনো ছুটি নেই</li>}
      </ul>
    </div>
  );
}