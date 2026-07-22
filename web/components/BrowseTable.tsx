"use client";

// Accessible table view over the same data and filters as the map.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatCount, hubUrl, loadAtlas, repoName, weekToDate, type AtlasData } from "../lib/data";
import { applyFilters, EMPTY_FILTERS, type FilterState } from "../lib/filters";
import ThemeToggle from "./ThemeToggle";

const ROW_H = 40;
type SortKey = "downloads" | "likes" | "created" | "name";

export default function BrowseTable() {
  const [data, setData] = useState<AtlasData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortKey>("downloads");
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(600);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadAtlas().then(setData).catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [data]);

  const names = useMemo(() => {
    if (!data) return [];
    const n = data.manifest.n_points;
    const out = new Array<string>(n);
    for (let i = 0; i < n; i++) out[i] = repoName(data, i);
    return out;
  }, [data]);

  const rows = useMemo(() => {
    if (!data) return [];
    const n = data.manifest.n_points;
    const mask = new Float32Array(n);
    applyFilters(data.attrs, filters, mask);
    const needle = q.trim().toLowerCase();
    const idx: number[] = [];
    for (let i = 0; i < n; i++) {
      if (mask[i] === 0) continue;
      if (needle && !names[i].toLowerCase().includes(needle)) continue;
      idx.push(i);
    }
    const { downloads, likes, created_week } = data.attrs;
    const cmp: Record<SortKey, (a: number, b: number) => number> = {
      downloads: (a, b) => downloads[b] - downloads[a],
      likes: (a, b) => likes[b] - likes[a],
      created: (a, b) => created_week[b] - created_week[a],
      name: (a, b) => names[a].localeCompare(names[b]),
    };
    idx.sort(cmp[sort]);
    return idx;
  }, [data, names, q, filters, sort]);

  if (error) {
    return (
      <div className="flex h-dvh items-center justify-center bg-abyss p-8 font-mono text-sm text-chalk">
        The atlas data failed to load ({error}). Reload to try again.
      </div>
    );
  }
  if (!data) return null;

  const first = Math.max(0, Math.floor(scrollTop / ROW_H) - 10);
  const last = Math.min(rows.length, Math.ceil((scrollTop + viewH) / ROW_H) + 10);
  const set = (patch: Partial<FilterState>) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <main className="flex h-dvh flex-col bg-abyss text-chalk">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b hairline px-4 py-3">
        <Link href="/" className="font-display text-[17px] font-bold">
          Hublands
        </Link>
        <nav className="flex gap-3 font-mono text-[12px] text-chalk/70">
          <Link href="/map" className="hover:text-chalk">map</Link>
          <span aria-current="page" className="text-chalk">browse</span>
          <Link href="/methods" className="hover:text-chalk">methods</Link>
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <span className="font-mono text-[11px] text-chalk/50">
            {formatCount(rows.length)} of {formatCount(data.manifest.n_points)} repos
          </span>
          <ThemeToggle className="text-[11px]" />
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b hairline px-4 py-2.5">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by name"
          aria-label="Filter repos by name"
          className="w-56 border hairline bg-transparent px-2.5 py-1.5 font-mono text-[12px] placeholder:text-chalk/40"
        />
        <Select
          label="kind"
          value={filters.kind}
          options={["all", "models", "datasets"]}
          onChange={(v) => set({ kind: v as FilterState["kind"] })}
        />
        <IndexSelect label="task" value={filters.task} options={data.vocab.tasks} onChange={(v) => set({ task: v })} />
        <IndexSelect
          label="library"
          value={filters.library}
          options={data.vocab.libraries}
          onChange={(v) => set({ library: v })}
        />
        <IndexSelect
          label="license"
          value={filters.license}
          options={data.vocab.licenses}
          onChange={(v) => set({ license: v })}
        />
        <label className="flex items-center gap-1.5 font-mono text-[11px] text-chalk/60">
          sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="border hairline bg-transparent px-1.5 py-1 text-chalk/90 [&>option]:bg-abyss"
          >
            <option value="downloads">downloads</option>
            <option value="likes">likes</option>
            <option value="created">newest</option>
            <option value="name">name</option>
          </select>
        </label>
      </div>

      <div
        ref={scrollRef}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {rows.length === 0 ? (
          <p className="p-6 font-mono text-[13px] text-chalk/60">
            No repos match these filters. Try widening them.
          </p>
        ) : (
          <table className="w-full border-collapse font-mono text-[12px]">
            <caption className="sr-only">
              Repos on the Hugging Face Hub matching the current filters
            </caption>
            <thead className="sticky top-0 z-10 bg-abyss">
              <tr className="border-b hairline text-left text-[10px] uppercase tracking-wider text-chalk/50">
                <th scope="col" className="px-4 py-2 font-medium">repo</th>
                <th scope="col" className="w-24 px-2 py-2 text-right font-medium">downloads</th>
                <th scope="col" className="w-20 px-2 py-2 text-right font-medium">likes</th>
                <th scope="col" className="hidden w-28 px-2 py-2 font-medium sm:table-cell">task</th>
                <th scope="col" className="hidden w-24 px-2 py-2 font-medium md:table-cell">license</th>
                <th scope="col" className="hidden w-24 px-4 py-2 text-right font-medium md:table-cell">created</th>
              </tr>
            </thead>
            <tbody>
              {first > 0 && (
                <tr aria-hidden style={{ height: first * ROW_H }}>
                  <td colSpan={6} />
                </tr>
              )}
              {rows.slice(first, last).map((i) => {
                const kind = data.attrs.kind[i];
                const task = data.attrs.task[i];
                const lic = data.attrs.license[i];
                return (
                  <tr key={i} className="border-b hairline hover:bg-chalk/5" style={{ height: ROW_H }}>
                    <td className="max-w-0 truncate px-4">
                      <span aria-hidden className="mr-1.5 text-chalk/40">{kind === 0 ? "●" : "○"}</span>
                      <span className="sr-only">{kind === 0 ? "model" : "dataset"} </span>
                      <a
                        href={hubUrl(names[i], kind)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-chalk hover:underline"
                      >
                        {names[i]}
                      </a>
                    </td>
                    <td className="px-2 text-right text-chalk/80">{formatCount(data.attrs.downloads[i])}</td>
                    <td className="px-2 text-right text-chalk/60">{formatCount(data.attrs.likes[i])}</td>
                    <td className="hidden truncate px-2 text-chalk/60 sm:table-cell">
                      {task !== 255 ? data.vocab.tasks[task] : ""}
                    </td>
                    <td className="hidden truncate px-2 text-chalk/60 md:table-cell">
                      {lic !== 255 ? data.vocab.licenses[lic] : ""}
                    </td>
                    <td className="hidden px-4 text-right text-chalk/60 md:table-cell">
                      {weekToDate(data.manifest.week_epoch, data.attrs.created_week[i])
                        .toISOString()
                        .slice(0, 10)}
                    </td>
                  </tr>
                );
              })}
              {last < rows.length && (
                <tr aria-hidden style={{ height: (rows.length - last) * ROW_H }}>
                  <td colSpan={6} />
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 font-mono text-[11px] text-chalk/60">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border hairline bg-transparent px-1.5 py-1 text-chalk/90 [&>option]:bg-abyss"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function IndexSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: number;
  options: string[];
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 font-mono text-[11px] text-chalk/60">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="max-w-36 border hairline bg-transparent px-1.5 py-1 text-chalk/90 [&>option]:bg-abyss"
      >
        <option value={-1}>any</option>
        {options.map((o, i) => (
          <option key={o} value={i}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
