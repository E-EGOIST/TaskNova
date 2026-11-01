import { useState } from "react";
import LoginPage, { type User } from "./LoginPage";
import AdminApp from "./AdminApp";
import ManagerApp from "./ManagerApp";
import MemberApp from "./MemberApp";
import { LangProvider } from "./i18n";

function Main() {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem("user");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

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

  if (!user) return <LoginPage onLogin={handleLogin} />;
  if (user.role === "ADMIN") return <AdminApp user={user} onLogout={logout} />;
  if (user.role === "MANAGER") return <ManagerApp user={user} onLogout={logout} />;
  return <MemberApp user={user} onLogout={logout} />;
}

export default function App() {
  return (
    <LangProvider>
      <Main />
    </LangProvider>
  );
}