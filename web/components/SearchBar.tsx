"use client";

// Search input. Name mode is always on; semantic mode is opt-in because
// it downloads the model and vectors.

import { useEffect, useRef, useState } from "react";
import { formatCount, repoName, type AtlasData } from "../lib/data";
import type { SemanticState } from "./AtlasApp";

export default function SearchBar({
  q,
  mode,
  semantic,
  semBytes,
  matches,
  data,
  onQuery,
  onMode,
  onEnableSemantic,
  onPick,
}: {
  q: string;
  mode: "name" | "meaning";
  semantic: SemanticState;
  semBytes: number;
  matches: Uint32Array | null;
  data: AtlasData;
  onQuery: (q: string) => void;
  onMode: (m: "name" | "meaning") => void;
  onEnableSemantic: () => void;
  onPick: (i: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => setCursor(-1), [q, mode]);

  const shown = matches ? Array.from(matches.slice(0, 40)) : [];
  const mb = (semBytes / 1e6).toFixed(1);

  return (
    <div ref={boxRef} className="absolute left-1/2 top-4 z-20 w-[min(480px,calc(100vw-2rem))] -translate-x-1/2">
      <div className="panel flex items-stretch">
        <input
          type="search"
          value={q}
          placeholder={mode === "name" ? "Search by name" : "Describe what you need"}
          aria-label="Search repos"
          className="w-full bg-transparent px-3 py-2 font-mono text-[13px] text-chalk placeholder:text-chalk/40 focus:outline-none"
          onChange={(e) => {
            onQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setCursor((c) => Math.min(c + 1, shown.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => Math.max(c - 1, -1));
            } else if (e.key === "Enter" && cursor >= 0 && shown[cursor] !== undefined) {
              onPick(shown[cursor]);
              setOpen(false);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        <div className="flex shrink-0 items-center gap-1 pr-1.5">
          <ModeButton active={mode === "name"} onClick={() => onMode("name")}>
            name
          </ModeButton>
          {semantic === "ready" ? (
            <ModeButton active={mode === "meaning"} onClick={() => onMode("meaning")}>
              meaning
            </ModeButton>
          ) : (
            <button
              onClick={onEnableSemantic}
              disabled={semantic === "loading"}
              className="whitespace-nowrap px-2 py-1 font-mono text-[11px] text-chalk/60 hover:text-chalk disabled:opacity-60"
              title={`Loads the embedding model and vectors (${mb} MB) once, then searches by meaning on your machine`}
            >
              {semantic === "loading"
                ? "loading model…"
                : semantic === "error"
                  ? "semantic failed, retry"
                  : `Enable semantic search (${mb} MB, one time)`}
            </button>
          )}
        </div>
      </div>

      {open && q && matches && (
        <ul className="panel mt-1 max-h-72 overflow-y-auto" role="listbox" aria-label="Search results">
          {shown.length === 0 && (
            <li className="px-3 py-2 font-mono text-[12px] text-chalk/60">
              No repos match. {mode === "name" ? "Try a shorter fragment." : "Try different words."}
            </li>
          )}
          {shown.map((i, k) => (
            <li key={i} role="option" aria-selected={k === cursor}>
              <button
                className={`flex w-full items-baseline justify-between gap-3 px-3 py-1.5 text-left font-mono text-[12px] hover:bg-chalk/10 ${k === cursor ? "bg-chalk/10" : ""}`}
                onClick={() => {
                  onPick(i);
                  setOpen(false);
                }}
              >
                <span className="truncate text-chalk">
                  <span aria-hidden className="mr-1.5 text-chalk/50">{data.attrs.kind[i] === 0 ? "●" : "○"}</span>
                  {repoName(data, i)}
                </span>
                <span className="shrink-0 text-chalk/50">{formatCount(data.attrs.downloads[i])}</span>
              </button>
            </li>
          ))}
          {matches.length > shown.length && (
            <li className="px-3 py-1.5 font-mono text-[11px] text-chalk/40">
              {matches.length} matches shown on the chart
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`px-2 py-1 font-mono text-[11px] ${active ? "bg-chalk/15 text-chalk" : "text-chalk/60 hover:text-chalk"}`}
    >
      {children}
    </button>
  );
}
