import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from "react";
import { EXACT, PATTERNS } from "./bn";

export type Lang = "en" | "bn";
const STORAGE_KEY = "tasknova_lang";
const ATTRS = ["placeholder", "aria-label", "title"] as const;
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "NOSCRIPT"]);

/* ---------- translate one string (English -> Bangla) ---------- */
const has = (k: string) => Object.prototype.hasOwnProperty.call(EXACT, k);

export function tr(s: string): string {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
  if (!m || !m[2]) return s;
  const [, pre, core, post] = m;
  if (has(core)) return pre + EXACT[core] + post;
  for (const [re, fn] of PATTERNS) {
    const hit = re.exec(core);
    if (hit) return pre + fn(hit) + post;
  }
  return s;
}

/* ---------- DOM translator ---------- */
// For every node we remember the original English text and the Bangla text we wrote.
// If the current value differs from what we wrote, React changed it, so it is new English.
const orig = new WeakMap<Node, string>();
const shown = new WeakMap<Node, string>();
const attrOrig = new WeakMap<Element, Record<string, string>>();
const attrShown = new WeakMap<Element, Record<string, string>>();

const skipEl = (el: Element | null) => !el || SKIP_TAGS.has(el.tagName) || !!el.closest("[data-no-i18n]");

function doText(node: Node) {
  const cur = node.nodeValue;
  if (cur === null || skipEl(node.parentElement)) return;
  if (shown.get(node) === cur) return; // already our Bangla text
  orig.set(node, cur);
  const out = tr(cur);
  if (out !== cur) {
    shown.set(node, out);
    node.nodeValue = out;
  } else {
    shown.delete(node);
  }
}

function doAttrs(el: Element) {
  if (skipEl(el)) return;
  for (const a of ATTRS) {
    const cur = el.getAttribute(a);
    if (cur === null) continue;
    const sh = attrShown.get(el) ?? {};
    if (sh[a] === cur) continue;
    const og = attrOrig.get(el) ?? {};
    og[a] = cur;
    attrOrig.set(el, og);
    const out = tr(cur);
    if (out !== cur) {
      sh[a] = out;
      attrShown.set(el, sh);
      el.setAttribute(a, out);
    } else if (sh[a] !== undefined) {
      delete sh[a];
    }
  }
}

function translateTree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return doText(root);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  doAttrs(el);
  el.querySelectorAll("[placeholder],[aria-label],[title]").forEach(doAttrs);
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) doText(n);
}

function restoreTree(root: Node) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const sh = shown.get(n);
    if (sh !== undefined && n.nodeValue === sh) n.nodeValue = orig.get(n) ?? sh;
    shown.delete(n);
  }
  (root as Element).querySelectorAll("[placeholder],[aria-label],[title]").forEach((el) => {
    const sh = attrShown.get(el);
    const og = attrOrig.get(el);
    if (!sh || !og) return;
    for (const a of ATTRS) if (sh[a] !== undefined && el.getAttribute(a) === sh[a]) el.setAttribute(a, og[a]);
    attrShown.delete(el);
  });
}

/* ---------- React side ---------- */
type Ctx = { lang: Lang; setLang: (l: Lang) => void };
const LangCtx = createContext<Ctx>({ lang: "en", setLang: () => {} });
export const useLang = () => useContext(LangCtx);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "bn" ? "bn" : "en";
    } catch {
      return "en";
    }
  });

  const setLang = (l: Lang) => {
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
    setLangState(l);
  };

  useLayoutEffect(() => {
    document.documentElement.lang = lang;
    if (lang === "en") {
      restoreTree(document.body);
      return;
    }

    translateTree(document.body);
    const obs = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "characterData") doText(r.target);
        else if (r.type === "attributes") doAttrs(r.target as Element);
        else r.addedNodes.forEach(translateTree);
      }
    });
    obs.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...ATTRS],
    });

    // window.confirm / prompt / alert text is not part of the DOM, so translate it here
    const { confirm: c, prompt: p, alert: a } = window;
    window.confirm = (msg?: string) => c.call(window, msg ? tr(msg) : msg);
    window.prompt = (msg?: string, def?: string) => p.call(window, msg ? tr(msg) : msg, def);
    window.alert = (msg?: unknown) => a.call(window, typeof msg === "string" ? tr(msg) : msg);

    return () => {
      obs.disconnect();
      window.confirm = c;
      window.prompt = p;
      window.alert = a;
    };
  }, [lang]);

  const on = "bg-indigo-600 text-white";
  const off = "bg-white text-slate-600 hover:bg-slate-50";
  return (
    <LangCtx.Provider value={{ lang, setLang }}>
      {children}
      <div
        data-no-i18n
        className="fixed bottom-4 right-4 z-50 flex overflow-hidden rounded-full border border-slate-300 text-xs font-semibold shadow-lg"
      >
        <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")} className={`px-3 py-1.5 ${lang === "en" ? on : off}`}>
          EN
        </button>
        <button type="button" aria-pressed={lang === "bn"} onClick={() => setLang("bn")} className={`px-3 py-1.5 ${lang === "bn" ? on : off}`}>
          বাং
        </button>
      </div>
    </LangCtx.Provider>
  );
}