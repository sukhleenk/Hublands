"use client";

import Link from "next/link";

export default function TopBar({
  selectMode = false,
  locateOpen = false,
  onToggleSelect,
  onToggleLocate,
}: {
  selectMode?: boolean;
  locateOpen?: boolean;
  onToggleSelect?: () => void;
  onToggleLocate?: () => void;
}) {
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-4">
      <Link href="/" className="pointer-events-auto group flex items-baseline gap-2">
        <span className="font-display text-[17px] font-bold text-chalk">Hublands</span>
        <span className="hidden font-mono text-[11px] text-chalk/50 sm:inline">
          survey chart of the open model ecosystem
        </span>
      </Link>
      <nav className="pointer-events-auto flex gap-1 font-mono text-[12px]">
        <button
          onClick={onToggleLocate}
          aria-pressed={locateOpen}
          className={`panel px-2.5 py-1 hover:text-chalk ${locateOpen ? "text-chalk" : "text-chalk/80"}`}
          title="Estimate where a description would land on the chart"
        >
          locate
        </button>
        <button
          onClick={onToggleSelect}
          aria-pressed={selectMode}
          className={`panel px-2.5 py-1 hover:text-chalk ${selectMode ? "text-flare" : "text-chalk/80"}`}
          title="Drag a box to select and export repos"
        >
          select
        </button>
        <Link href="/browse" className="panel px-2.5 py-1 text-chalk/80 hover:text-chalk">
          browse
        </Link>
        <Link href="/methods" className="panel px-2.5 py-1 text-chalk/80 hover:text-chalk">
          methods
        </Link>
      </nav>
    </header>
  );
}
