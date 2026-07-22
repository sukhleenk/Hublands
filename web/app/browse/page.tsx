"use client";

import dynamic from "next/dynamic";

const BrowseTable = dynamic(() => import("../../components/BrowseTable"), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh items-center justify-center bg-abyss text-chalk">
      <div className="label-caps animate-pulse text-sm tracking-widest">Loading the ledger…</div>
    </div>
  ),
});

export default function BrowsePage() {
  return <BrowseTable />;
}
