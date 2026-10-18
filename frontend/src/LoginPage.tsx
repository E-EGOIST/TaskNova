import { useState, useEffect, type FormEvent } from "react";
import { api } from "./api";

export type User = { id: number; name: string; email: string; role: string };

function BrandMark() {
  return (
    <div className="relative w-10 h-10 group">
      <div
        className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg transition-transform duration-300 ease-out group-hover:-rotate-6 group-hover:scale-105"
        style={{
          background: "linear-gradient(135deg, var(--color-teal) 0%, var(--color-amber) 100%)",
          boxShadow: "0 10px 28px -10px var(--color-teal)",
        }}
      >
        <span className="font-display font-black text-lg text-[color:var(--color-ink)]" style={{ fontStyle: "italic" }}>
          T
        </span>
      </div>
      <svg
        className="absolute -top-1.5 -right-1.5 w-4 h-4 transition-transform duration-500 ease-out group-hover:rotate-180"
        viewBox="0 0 24 24"
      >
        <path
          d="M12 1 L14.5 9.5 L23 12 L14.5 14.5 L12 23 L9.5 14.5 L1 12 L9.5 9.5 Z"
          fill="var(--color-coral)"
          stroke="rgba(5,7,13,0.55)"
          strokeWidth="0.5"
        />
      </svg>
    </div>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-10-8-10-8a18.6 18.6 0 0 1 5.17-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

const MIN_PASSWORD_LENGTH = 6;
const inputCls =
  "w-full mt-1 px-3 py-2 rounded-lg bg-white/5 text-white placeholder-[color:var(--color-muted)] border border-white/10 focus:border-[color:var(--color-teal)] focus:ring-1 focus:ring-[color:var(--color-teal)] outline-none transition-colors";

export default function LoginPage({ onLogin }: { onLogin: (token: string, user: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [name, setName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("tasknova_remember_email");
    if (saved) {
      setEmail(saved);
      setRememberMe(true);
    }
  }, []);

  function switchMode(next: "login" | "register") {
    setMode(next);
    setError("");
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
  }

  async function doLogin() {
    const data = await api<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: { email: email.trim(), password },
    });
    if (rememberMe) localStorage.setItem("tasknova_remember_email", email.trim());
    else localStorage.removeItem("tasknova_remember_email");
    onLogin(data.token, data.user);
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await doLogin();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Please enter your name.");
    if (!email.trim()) return setError("Please enter your email.");
    if (password.length < MIN_PASSWORD_LENGTH)
      return setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    if (password !== confirmPassword) return setError("Passwords do not match.");

    setLoading(true);
    try {
      // role পাঠানো হয় না: নতুন অ্যাকাউন্ট সবসময় MEMBER
      await api("/auth/register", {
        method: "POST",
        body: { name: name.trim(), email: email.trim(), password },
      });
      // backend register-এ token দেয় না, তাই সাথে সাথে login করিয়ে দিই
      await doLogin();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function showComingSoon(label: string) {
    setNotice(`${label} is coming soon.`);
    setTimeout(() => setNotice(""), 2500);
  }

  const isRegister = mode === "register";

  return (
    <div
      className="min-h-screen relative flex items-center justify-center px-4 py-10 overflow-hidden text-white"
      style={{ background: "radial-gradient(120% 100% at 50% 0%, #0c1220 0%, #05070d 55%, #020305 100%)" }}
    >
      <style>{`
        @keyframes nova-drift { 0%{transform:translate(-2%,-1%) scale(1)} 50%{transform:translate(2%,1%) scale(1.03)} 100%{transform:translate(-2%,-1%) scale(1)} }
        @keyframes nova-pulse { 0%,100%{opacity:.10} 50%{opacity:.18} }
        .nova-watermark { animation: nova-drift 16s ease-in-out infinite, nova-pulse 7s ease-in-out infinite; }
        @keyframes blob-a { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(6%,4%) scale(1.15)} }
        @keyframes blob-b { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-5%,-6%) scale(1.1)} }
        @keyframes fade-in-up { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .blob-teal { animation: blob-a 15s ease-in-out infinite; }
        .blob-amber { animation: blob-b 19s ease-in-out infinite; }
        .notice-pop { animation: fade-in-up .25s ease-out; }
        .signin-hover { transition: letter-spacing .3s ease, color .3s ease; cursor: default; }
        .signin-hover:hover {
          background: linear-gradient(135deg, var(--color-teal), var(--color-amber));
          -webkit-background-clip: text; background-clip: text; color: transparent; letter-spacing: .04em;
        }
        .btn-shine { position: relative; overflow: hidden; }
        .btn-shine::before {
          content: ''; position: absolute; top: 0; left: -150%; width: 50%; height: 100%;
          background: linear-gradient(120deg, transparent, rgba(255,255,255,.4), transparent);
          transform: skewX(-20deg); transition: left .6s ease;
        }
        .btn-shine:hover::before { left: 150%; }
        @media (prefers-reduced-motion: reduce) {
          .blob-teal, .blob-amber, .notice-pop, .nova-watermark { animation: none; }
        }
      `}</style>

      <div className="nova-watermark pointer-events-none absolute inset-0 flex items-center justify-center select-none px-6" aria-hidden="true">
        <span
          className="font-display font-bold leading-none tracking-tight whitespace-nowrap"
          style={{
            fontSize: "clamp(2.5rem, 11vw, 9rem)",
            background: "linear-gradient(135deg, var(--color-teal), var(--color-amber), var(--color-coral))",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          TaskNova
        </span>
      </div>

      <div
        className="blob-teal pointer-events-none absolute -top-32 -left-24 w-[26rem] h-[26rem] rounded-full blur-[120px] opacity-20"
        style={{ background: "radial-gradient(circle, var(--color-teal) 0%, transparent 70%)" }}
      />
      <div
        className="blob-amber pointer-events-none absolute -bottom-40 -right-20 w-[30rem] h-[30rem] rounded-full blur-[130px] opacity-15"
        style={{ background: "radial-gradient(circle, var(--color-amber) 0%, transparent 70%)" }}
      />

      <div className="relative w-full max-w-sm">
        <div className="flex items-center gap-2.5 mb-6 justify-center">
          <BrandMark />
          <span className="font-display font-semibold text-xl tracking-tight">TaskNova</span>
        </div>

        <div className="text-center mb-5">
          <h2 className="font-display font-semibold text-2xl tracking-tight mb-1">
            {isRegister ? "Create your account" : "Welcome Back!"}
          </h2>
          <p className="text-sm text-[color:var(--color-muted)]">
            {isRegister ? "Join your team on TaskNova" : "Login to your account"}
          </p>
        </div>

        <div
          className="relative rounded-2xl p-6 border border-white/10 backdrop-blur-2xl shadow-2xl"
          style={{ background: "linear-gradient(160deg, rgba(20,26,38,0.78) 0%, rgba(10,14,22,0.6) 100%)" }}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent rounded-t-2xl" />

          <h1 className="signin-hover font-display font-semibold text-lg mb-1 text-center inline-block w-full">
            {isRegister ? "Sign up" : "Sign in"}
          </h1>
          <p className="text-sm text-[color:var(--color-muted)] mb-5 text-center">Autonomous Task Allocation System</p>

          <form onSubmit={isRegister ? handleRegister : handleLogin} className="flex flex-col gap-3" noValidate>
            {isRegister && (
              <label className="text-xs font-medium text-[color:var(--color-muted)]">
                Full name
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={inputCls} required />
              </label>
            )}

            <label className="text-xs font-medium text-[color:var(--color-muted)]">
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className={inputCls} required />
            </label>

            <label className="text-xs font-medium text-[color:var(--color-muted)]">
              Password
              <div className="relative mt-1">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={isRegister ? "new-password" : "current-password"}
                  className="w-full px-3 py-2 pr-10 rounded-lg bg-white/5 text-white border border-white/10 focus:border-[color:var(--color-teal)] focus:ring-1 focus:ring-[color:var(--color-teal)] outline-none transition-colors"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-[color:var(--color-muted)] hover:text-white transition-colors"
                >
                  <EyeIcon open={showPassword} />
                </button>
              </div>
            </label>

            {isRegister && (
              <label className="text-xs font-medium text-[color:var(--color-muted)]">
                Confirm password
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  className={inputCls}
                  required
                />
              </label>
            )}

            {!isRegister && (
              <div className="flex items-center justify-between mt-1">
                <label className="flex items-center gap-2 text-xs text-[color:var(--color-muted)] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-3.5 h-3.5 rounded accent-[color:var(--color-teal)]"
                  />
                  Remember me
                </label>
                <button type="button" onClick={() => showComingSoon("Password reset")} className="text-xs text-[color:var(--color-teal)] hover:underline">
                  Forgot password?
                </button>
              </div>
            )}

            {error && (
              <p role="alert" aria-live="assertive" className="text-xs text-[color:var(--color-coral)]">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="btn-shine mt-2 w-full py-2.5 rounded-xl font-medium text-sm text-[color:var(--color-ink)] transition-all hover:brightness-110 hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50 disabled:hover:translate-y-0"
              style={{
                background: "linear-gradient(135deg, var(--color-teal), var(--color-amber))",
                boxShadow: "0 8px 20px -8px var(--color-teal)",
              }}
            >
              {loading ? (isRegister ? "Creating account…" : "Signing in…") : isRegister ? "Create account" : "Sign in"}
            </button>
          </form>

          <p className="text-center text-xs text-[color:var(--color-muted)] mt-5">
            {isRegister ? (
              <>
                Already have an account?{" "}
                <button type="button" onClick={() => switchMode("login")} className="text-[color:var(--color-teal)] hover:underline font-medium">
                  Sign in
                </button>
              </>
            ) : (
              <>
                Don&apos;t have an account?{" "}
                <button type="button" onClick={() => switchMode("register")} className="text-[color:var(--color-teal)] hover:underline font-medium">
                  Create Account
                </button>
              </>
            )}
          </p>
        </div>

        {notice && (
          <div
            role="status"
            aria-live="polite"
            className="notice-pop mt-4 text-center text-xs px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-[color:var(--color-muted)]"
          >
            {notice}
          </div>
        )}
      </div>
    </div>
  );
}