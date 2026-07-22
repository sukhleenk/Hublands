"use client";

// Site-wide theme toggle, persisted to localStorage. The layout script
// applies the stored value before paint.

import { useEffect, useState } from "react";

export type Theme = "deep" | "chart";

export function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t === "chart" ? "chart" : "";
  try {
    localStorage.setItem("hublands-theme", t);
  } catch {}
  window.dispatchEvent(new CustomEvent<Theme>("hublands-theme", { detail: t }));
}

export function currentTheme(): Theme {
  return typeof document !== "undefined" && document.documentElement.dataset.theme === "chart"
    ? "chart"
    : "deep";
}

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("deep");
  useEffect(() => {
    setTheme(currentTheme());
    const onChange = (e: Event) => setTheme((e as CustomEvent<Theme>).detail);
    window.addEventListener("hublands-theme", onChange);
    return () => window.removeEventListener("hublands-theme", onChange);
  }, []);
  return (
    <button
      onClick={() => applyTheme(theme === "deep" ? "chart" : "deep")}
      className={`font-mono text-[12px] text-chalk/70 hover:text-chalk ${className}`}
    >
      {theme === "deep" ? "day chart" : "night chart"}
    </button>
  );
}
