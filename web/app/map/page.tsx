"use client";

import dynamic from "next/dynamic";

const AtlasApp = dynamic(() => import("../../components/AtlasApp"), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh items-center justify-center bg-abyss text-chalk">
      <div className="label-caps animate-pulse text-sm tracking-widest">Sounding the depths…</div>
    </div>
  ),
});

export default function MapPage() {
  return <AtlasApp />;
}
