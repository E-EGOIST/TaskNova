import Team from "./Team";
import Dashboard from "./Dashboard";
import { useState } from "react";
import { api } from "./api";

type User = { id: number; name: string; email: string; role: string };

export default function App() {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem("user");
    return saved ? JSON.parse(saved) : null;
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
const [tab, setTab] = useState<"tasks" | "team">("tasks");

  async function login() {
    setError("");
    try {
      const data = await api<{ token: string; user: User }>("/auth/login", {
        method: "POST",
        body: { email, password },
      });
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      setUser(data.user);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function logout() {
    localStorage.clear();
    setUser(null);
  }

    if (user) {
    return (
      <div className="min-h-screen bg-gray-100">
        <header className="flex items-center justify-between bg-white px-6 py-3 shadow">
          <h1 className="text-xl font-bold">TaskNova</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">
              {user.name} ({user.role})
            </span>
            <button onClick={logout} className="rounded bg-gray-800 px-3 py-1 text-sm text-white">
              Logout
            </button>
          </div>
        </header>
                <main className="mx-auto max-w-4xl p-6">
          {user.role !== "MEMBER" && (
            <div className="mb-4 flex gap-2">
              <button
                onClick={() => setTab("tasks")}
                className={`rounded px-4 py-2 text-sm ${tab === "tasks" ? "bg-blue-600 text-white" : "bg-white"}`}
              >
                টাস্ক
              </button>
              <button
                onClick={() => setTab("team")}
                className={`rounded px-4 py-2 text-sm ${tab === "team" ? "bg-blue-600 text-white" : "bg-white"}`}
              >
                টিম ও Skills
              </button>
            </div>
          )}
          {user.role !== "MEMBER" && tab === "team" ? <Team /> : <Dashboard role={user.role} />}
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="w-80 rounded-lg bg-white p-6 shadow">
        <h1 className="mb-4 text-2xl font-bold">TaskNova</h1>
        <input
          className="mb-3 w-full rounded border p-2"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="mb-3 w-full rounded border p-2"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <button onClick={login} className="w-full rounded bg-blue-600 p-2 text-white">
          Login
        </button>
      </div>
    </div>
  );
}