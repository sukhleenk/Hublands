"use client";

// Decorative sheet border with tick marks.

export default function ChartFrame() {
  const ticks = Array.from({ length: 17 }, (_, i) => i);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-10">
      {/* double border, like a printed chart sheet */}
      <div className="absolute inset-2 border border-chalk/25" />
      <div className="absolute inset-3.5 border border-chalk/10" />

      {/* tick marks along the frame */}
      <svg className="absolute inset-0 h-full w-full text-chalk/30">
        {ticks.map((i) => {
          const p = 4 + (i / 16) * 92; // percent along each edge
          return (
            <g key={i}>
              <line x1={`${p}%`} y1="8" x2={`${p}%`} y2={i % 4 === 0 ? "17" : "13"} stroke="currentColor" strokeWidth="1" />
              <line x1={`${p}%`} y1="calc(100% - 8px)" x2={`${p}%`} y2={i % 4 === 0 ? "calc(100% - 17px)" : "calc(100% - 13px)"} stroke="currentColor" strokeWidth="1" />
              <line x1="8" y1={`${p}%`} x2={i % 4 === 0 ? "17" : "13"} y2={`${p}%`} stroke="currentColor" strokeWidth="1" />
              <line x1="calc(100% - 8px)" y1={`${p}%`} x2={i % 4 === 0 ? "calc(100% - 17px)" : "calc(100% - 13px)"} y2={`${p}%`} stroke="currentColor" strokeWidth="1" />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
