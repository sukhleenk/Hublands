"use client";

// Map key panel: legend, region list, and the filter controls.

import { useMemo, useState } from "react";
import { formatCount, type AtlasData } from "../lib/data";
import { EMPTY_FILTERS, filtersActive, type FilterState } from "../lib/filters";
import { l1Css } from "../lib/palette";
import DateSlider from "./DateSlider";

const WEEK_MS = 7 * 24 * 3600 * 1000;

export default function Legend({
  data,
  filters,
  theme,
  visibleCount,
  onFilters,
  onTheme,
  onRegion,
}: {
  data: AtlasData;
  filters: FilterState;
  theme: "deep" | "chart";
  visibleCount: number;
  onFilters: (f: FilterState) => void;
  onTheme: (t: "deep" | "chart") => void;
  onRegion?: (x: number, y: number) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const m = data.manifest;
  const surveyed = new Date(m.built_at).toLocaleDateString("en", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const maxWeek = useMemo(
    () => Math.ceil((Date.now() - new Date(m.week_epoch).getTime()) / WEEK_MS),
    [m.week_epoch]
  );
  const set = (patch: Partial<FilterState>) => onFilters({ ...filters, ...patch });
  const active = filtersActive(filters);

  return (
    <section
      aria-label="Legend and filters"
      className="panel absolute bottom-4 left-4 z-20 w-[268px] max-w-[calc(100vw-2rem)] text-chalk"
    >
      <header className="flex items-center justify-between border-b hairline px-3 py-2">
        <h2 className="font-display text-[14px] font-semibold">Map key</h2>
        <div className="flex items-center gap-2 font-mono text-[10px] text-chalk/60">
          <button onClick={() => onTheme(theme === "deep" ? "chart" : "deep")} className="hover:text-chalk">
            {theme === "deep" ? "day chart" : "night chart"}
          </button>
          <button
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            className="hover:text-chalk"
          >
            {collapsed ? "expand" : "collapse"}
          </button>
        </div>
      </header>

      {!collapsed && (
        <div className="space-y-3 px-3 py-3">
          {/* Region key: every point is inked by its region */}
          <div>
            <div className="label-caps text-[9px] text-chalk/50">Regions</div>
            <ul className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5">
              {data.vocab.clusters.l1
                .slice(0, 10)
                .map((e) => (
                  <li key={e.id}>
                    <button
                      onClick={() => onRegion?.(e.x, e.y)}
                      title={`${e.label} · ${formatCount(e.n)} repos`}
                      className="flex w-full items-center gap-1.5 py-0.5 text-left font-mono text-[10px] text-chalk/70 hover:text-chalk"
                    >
                      <span
                        aria-hidden
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: l1Css(e.id, theme) }}
                      />
                      <span className="truncate">{e.label}</span>
                    </button>
                  </li>
                ))}
            </ul>
          </div>

          {/* Density relief ramp */}
          <div>
            <div
              className="h-2 w-full"
              style={{
                background:
                  "linear-gradient(to right, var(--abyss), var(--deep), var(--shelf), var(--shoal), var(--shore), var(--crest))",
              }}
              aria-hidden
            />
            <div className="mt-1 flex justify-between font-mono text-[10px] text-chalk/60">
              <span>open sea</span>
              <span>crowded harbor</span>
            </div>
          </div>

          {/* Mark types, clickable */}
          <div className="flex gap-1 font-mono text-[11px]" role="group" aria-label="Filter by kind">
            <MarkButton
              mark="●"
              label={`models ${formatCount(m.n_models)}`}
              active={filters.kind === "models"}
              onClick={() => set({ kind: filters.kind === "models" ? "all" : "models" })}
            />
            <MarkButton
              mark="○"
              label={`datasets ${formatCount(m.n_datasets)}`}
              active={filters.kind === "datasets"}
              onClick={() => set({ kind: filters.kind === "datasets" ? "all" : "datasets" })}
            />
          </div>

          {/* Facets */}
          <div className="grid grid-cols-1 gap-1.5">
            <Facet label="task" value={filters.task} options={data.vocab.tasks} onChange={(v) => set({ task: v })} />
            <Facet
              label="library"
              value={filters.library}
              options={data.vocab.libraries}
              onChange={(v) => set({ library: v })}
            />
            <Facet
              label="license"
              value={filters.license}
              options={data.vocab.licenses}
              onChange={(v) => set({ license: v })}
            />
          </div>

          {/* Downloads floor */}
          <div>
            <div className="flex justify-between font-mono text-[10px] text-chalk/60">
              <span>min downloads / month</span>
              <span>{filters.minDownloads > 0 ? formatCount(Math.pow(10, filters.minDownloads)) : "any"}</span>
            </div>
            <input
              type="range"
              min={0}
              max={7}
              step={0.5}
              value={filters.minDownloads}
              aria-label="Minimum monthly downloads, log scale"
              className="mt-1 w-full"
              onChange={(e) => set({ minDownloads: Number(e.target.value) })}
            />
          </div>

          <DateSlider
            epoch={m.week_epoch}
            maxWeek={maxWeek}
            fromWeek={filters.fromWeek}
            toWeek={filters.toWeek}
            onChange={(fromWeek, toWeek) => set({ fromWeek, toWeek })}
          />

          <div className="flex items-center justify-between border-t hairline pt-2 font-mono text-[10px] text-chalk/60">
            <span>
              {formatCount(visibleCount)} of {formatCount(m.n_points)} charted
            </span>
            {active && (
              <button onClick={() => onFilters(EMPTY_FILTERS)} className="text-chalk/80 underline hover:text-chalk">
                clear filters
              </button>
            )}
          </div>
        </div>
      )}

      <footer className="border-t hairline px-3 py-1.5 font-mono text-[10px] text-chalk/50">
        Last surveyed: {surveyed} · by unmanned expedition
      </footer>
    </section>
  );
}

function MarkButton({
  mark,
  label,
  active,
  onClick,
}: {
  mark: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-1 items-center gap-1.5 border px-2 py-1 ${
        active ? "border-chalk/60 bg-chalk/10 text-chalk" : "hairline text-chalk/70 hover:text-chalk"
      }`}
    >
      <span aria-hidden>{mark}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

function Facet({
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
    <label className="flex items-center gap-2 font-mono text-[11px] text-chalk/70">
      <span className="w-14 shrink-0 text-[10px] uppercase tracking-wider text-chalk/50">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full appearance-none border hairline bg-transparent px-1.5 py-0.5 text-chalk/90 [&>option]:bg-abyss"
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
