import { DEFAULT_MIN_DOWNLOADS, EMPTY_FILTERS, type FilterState } from "./filters";

export interface UrlState {
  x: number | null;
  y: number | null;
  z: number | null;
  q: string;
  mode: "name" | "meaning";
  filters: FilterState;
  sel: string | null; // repo id, stable across rebuilds
  theme: "deep" | "chart";
}

export function readUrl(search: string): UrlState {
  const p = new URLSearchParams(search);
  const num = (k: string) => {
    const v = p.get(k);
    if (v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const int = (k: string, dflt: number) => {
    const v = num(k);
    return v === null ? dflt : Math.trunc(v);
  };
  const kind = p.get("kind");
  return {
    x: num("x"),
    y: num("y"),
    z: num("z"),
    q: p.get("q") ?? "",
    mode: p.get("mode") === "meaning" ? "meaning" : "name",
    filters: {
      kind: kind === "models" || kind === "datasets" ? kind : "all",
      task: int("task", -1),
      library: int("lib", -1),
      license: int("lic", -1),
      minDownloads: num("dl") ?? DEFAULT_MIN_DOWNLOADS,
      fromWeek: int("from", -1),
      toWeek: int("to", -1),
    },
    sel: p.get("sel"),
    theme: p.get("theme") === "chart" ? "chart" : "deep",
  };
}

export function writeUrl(s: UrlState): string {
  const p = new URLSearchParams();
  if (s.x !== null && s.y !== null && s.z !== null) {
    p.set("x", s.x.toFixed(4));
    p.set("y", s.y.toFixed(4));
    p.set("z", s.z.toFixed(2));
  }
  if (s.q) p.set("q", s.q);
  if (s.mode === "meaning") p.set("mode", s.mode);
  const f = s.filters;
  if (f.kind !== "all") p.set("kind", f.kind);
  if (f.task >= 0) p.set("task", String(f.task));
  if (f.library >= 0) p.set("lib", String(f.library));
  if (f.license >= 0) p.set("lic", String(f.license));
  if (f.minDownloads !== DEFAULT_MIN_DOWNLOADS) p.set("dl", String(f.minDownloads));
  if (f.fromWeek >= 0) p.set("from", String(f.fromWeek));
  if (f.toWeek >= 0) p.set("to", String(f.toWeek));
  if (s.sel) p.set("sel", s.sel);
  if (s.theme === "chart") p.set("theme", s.theme);
  const q = p.toString();
  return q ? `?${q}` : "";
}

export const DEFAULT_URL_STATE: UrlState = {
  x: null,
  y: null,
  z: null,
  q: "",
  mode: "name",
  filters: EMPTY_FILTERS,
  sel: null,
  theme: "deep",
};

let pending: number | undefined;

export function pushUrl(s: UrlState): void {
  if (typeof window === "undefined") return;
  window.clearTimeout(pending);
  pending = window.setTimeout(() => {
    const url = window.location.pathname + writeUrl(s);
    window.history.replaceState(null, "", url);
  }, 200);
}
