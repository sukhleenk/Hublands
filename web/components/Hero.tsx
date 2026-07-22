"use client";

import dynamic from "next/dynamic";
import ChartFrame from "./ChartFrame";

const AtlasApp = dynamic(() => import("./AtlasApp"), { ssr: false });

// Landing hero: the live map behind a vignette.
export default function Hero() {
  return (
    <div className="absolute inset-0">
      <AtlasApp hero />
      <ChartFrame />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, color-mix(in srgb, var(--abyss) 62%, transparent) 0%, transparent 40%), radial-gradient(120% 90% at 70% 30%, transparent 62%, color-mix(in srgb, var(--abyss) 38%, transparent) 100%)",
        }}
      />
    </div>
  );
}
