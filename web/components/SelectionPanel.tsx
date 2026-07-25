"use client";

// Result of a box selection: a count, a quick breakdown, a short preview, and
// export to CSV / JSON / clipboard. Everything is built client-side.

import { useMemo, useState } from "react";
import { formatCount, repoName, type AtlasData } from "../lib/data";
import { download, repoIds, toCsv, toJson } from "../lib/export";

export default function SelectionPanel({
  data,
  indices,
  onClose,
  onPick,
}: {
  data: AtlasData;
  indices: Uint32Array;
  onClose: () => void;
  onPick: (i: number) => void;
}) {
  const [copied, setCopied] = useState(false);

  const stats = useMemo(() => {
    let models = 0;
    let total = 0;
    for (let k = 0; k < indices.length; k++) {
      const i = indices[k];
      if (data.attrs.kind[i] === 0) models++;
      total += data.attrs.downloads[i];
    }
    const top = [...indices]
      .sort((a, b) => data.attrs.downloads[b] - data.attrs.downloads[a])
      .slice(0, 12);
    return { models, datasets: indices.length - models, total, top };
  }, [data, indices]);

  const stamp = new Date().toISOString().slice(0, 10);
  const copyIds = async () => {
    try {
      await navigator.clipboard.writeText(repoIds(data, indices));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <aside
      aria-label="Selection"
      className="panel absolute bottom-4 right-4 top-16 z-20 flex w-[340px] max-w-[calc(100vw-2rem)] flex-col text-chalk"
    >
      <header className="flex items-start justify-between gap-2 border-b hairline px-4 py-3">
        <div>
          <div className="label-caps text-[9px] text-chalk/45">Dredged from the chart</div>
          <h2 className="mt-0.5 font-display text-[15px] font-semibold">
            {formatCount(indices.length)} repos selected
          </h2>
        </div>
        <button onClick={onClose} aria-label="Close" className="text-chalk/50 hover:text-chalk">
          ✕
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 font-mono text-[11px]">
          <Stat k="models" v={formatCount(stats.models)} />
          <Stat k="datasets" v={formatCount(stats.datasets)} />
          <Stat k="downloads / mo" v={formatCount(stats.total)} />
          <Stat k="repos" v={formatCount(indices.length)} />
        </dl>

        {indices.length === 0 ? (
          <p className="mt-3 border-t hairline pt-3 font-mono text-[12px] text-chalk/60">
            Nothing inside the box passes the current filters. Widen them or draw
            a bigger box.
          </p>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-3 gap-1.5">
              <ExportBtn onClick={() => download(`hublands-${stamp}.csv`, "text/csv", toCsv(data, indices))}>
                CSV
              </ExportBtn>
              <ExportBtn
                onClick={() => download(`hublands-${stamp}.json`, "application/json", toJson(data, indices))}
              >
                JSON
              </ExportBtn>
              <ExportBtn onClick={copyIds}>{copied ? "copied" : "copy ids"}</ExportBtn>
            </div>

            <div className="mt-4 border-t hairline pt-3">
              <h3 className="label-caps text-[10px] text-chalk/60">Most downloaded here</h3>
              <ul className="mt-1.5 space-y-0.5">
                {stats.top.map((i) => (
                  <li key={i}>
                    <button
                      onClick={() => onPick(i)}
                      className="flex w-full items-baseline justify-between gap-2 py-0.5 text-left font-mono text-[11.5px] text-chalk/80 hover:text-chalk"
                    >
                      <span className="truncate">
                        <span aria-hidden className="mr-1 text-chalk/40">
                          {data.attrs.kind[i] === 0 ? "●" : "○"}
                        </span>
                        {repoName(data, i)}
                      </span>
                      <span className="shrink-0 text-chalk/40">
                        {formatCount(data.attrs.downloads[i])}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-chalk/50">{k}</dt>
      <dd className="text-right text-chalk/90">{v}</dd>
    </>
  );
}

function ExportBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="border hairline px-2 py-1.5 font-mono text-[11px] text-chalk/80 hover:bg-chalk/10 hover:text-chalk"
    >
      {children}
    </button>
  );
}
