"use client";

import Link from "next/link";

export default function TopBar() {
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-4">
      <Link href="/" className="pointer-events-auto group flex items-baseline gap-2">
        <span className="font-display text-[17px] font-bold text-chalk">Hublands</span>
        <span className="hidden font-mono text-[11px] text-chalk/50 sm:inline">
          survey chart of the open model ecosystem
        </span>
      </Link>
      <nav className="pointer-events-auto flex gap-1 font-mono text-[12px]">
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
