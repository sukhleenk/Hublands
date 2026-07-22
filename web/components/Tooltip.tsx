"use client";

import { formatCount, repoName, type AtlasData } from "../lib/data";
import { chartCoords } from "../lib/whimsy";

export default function Tooltip({
  data,
  index,
  x,
  y,
}: {
  data: AtlasData;
  index: number;
  x: number;
  y: number;
}) {
  const id = repoName(data, index);
  const kind = data.attrs.kind[index];
  const dl = data.attrs.downloads[index];
  const likes = data.attrs.likes[index];
  const l2 = data.attrs.cluster_l2[index];
  const region = data.vocab.clusters.l2.find((c) => c.id === l2)?.label;

  return (
    <div
      className="panel pointer-events-none absolute z-30 max-w-xs px-2.5 py-1.5 font-mono text-[12px] leading-snug"
      style={{ left: x + 14, top: y + 10 }}
    >
      <div className="flex items-center gap-1.5 text-chalk">
        <span aria-hidden>{kind === 0 ? "●" : "○"}</span>
        <span className="truncate">{id}</span>
      </div>
      <div className="mt-0.5 text-chalk/60">
        {formatCount(dl)} downloads · {formatCount(likes)} likes
        {region ? ` · ${region}` : ""}
      </div>
      <div className="mt-0.5 text-[10px] text-chalk/40">
        {chartCoords(data.positions[index * 2], data.positions[index * 2 + 1])}
      </div>
    </div>
  );
}
