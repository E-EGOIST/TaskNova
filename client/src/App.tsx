import Team from "./Team";
import Dashboard from "./Dashboard";
import { useState } from "react";
import LoginPage, { type User } from "./LoginPage";

export default function App() {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem("user");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [tab, setTab] = useState<"tasks" | "team">("tasks");

  function handleLogin(token: string, u: User) {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(u));
    setUser(u);
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
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
                Task
              </button>
              <button
                onClick={() => setTab("team")}
                className={`rounded px-4 py-2 text-sm ${tab === "team" ? "bg-blue-600 text-white" : "bg-white"}`}
              >
                Team and Skills
              </button>
            </div>
          )}
          {user.role !== "MEMBER" && tab === "team" ? <Team /> : <Dashboard role={user.role} />}
        </main>
      </div>
    );
  }

  return <LoginPage onLogin={handleLogin} />;
}