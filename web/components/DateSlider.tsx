"use client";

// Created-date range slider; play animates the upper bound.

import { useEffect, useRef, useState } from "react";
import { weekToDate } from "../lib/data";

export default function DateSlider({
  epoch,
  maxWeek,
  fromWeek,
  toWeek,
  onChange,
}: {
  epoch: string;
  maxWeek: number;
  fromWeek: number;
  toWeek: number;
  onChange: (from: number, to: number) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const rafRef = useRef(0);
  const from = fromWeek < 0 ? 0 : fromWeek;
  const to = toWeek < 0 ? maxWeek : toWeek;

  useEffect(() => {
    if (!playing) return;
    const start = performance.now();
    const startWeek = to >= maxWeek ? 0 : to;
    const duration = 8000 * (1 - startWeek / maxWeek);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const w = Math.round(startWeek + (maxWeek - startWeek) * t);
      onChange(from, w >= maxWeek ? -1 : w);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const fmt = (w: number) =>
    weekToDate(epoch, w).toLocaleDateString("en", { year: "numeric", month: "short" });

  return (
    <div>
      <div className="flex items-center justify-between font-mono text-[10px] text-chalk/60">
        <span>created {fmt(from)}</span>
        <span>{to >= maxWeek ? "now" : fmt(to)}</span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <button
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? "Pause the growth animation" : "Play the growth of the Hub"}
          className="w-5 shrink-0 text-center font-mono text-[11px] text-chalk/70 hover:text-chalk"
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <input
          type="range"
          min={0}
          max={maxWeek}
          value={from}
          aria-label="Created after"
          className="w-full"
          onChange={(e) => onChange(Math.min(Number(e.target.value), to - 1), toWeek)}
        />
        <input
          type="range"
          min={0}
          max={maxWeek}
          value={to}
          aria-label="Created before"
          className="w-full"
          onChange={(e) => {
            const w = Number(e.target.value);
            onChange(fromWeek, w >= maxWeek ? -1 : Math.max(w, from + 1));
          }}
        />
      </div>
    </div>
  );
}
