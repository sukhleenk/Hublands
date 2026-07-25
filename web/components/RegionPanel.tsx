"use client";

// Region briefing: a one-look summary of an L1 region, computed on click from
// the arrays already in memory. Makes the map legible and is itself a
// shareable artifact ("state of speech models").

import { formatCount, repoName, type AtlasData } from "../lib/data";
import { download, toCsv } from "../lib/export";
import type { RegionBrief } from "../lib/regions";

export default function RegionPanel({
  data,
  brief,
  onClose,
  onPick,
}: {
  data: AtlasData;
  brief: RegionBrief;
  onClose: () => void;
  onPick: (i: number) => void;
}) {
  const stamp = new Date().toISOString().slice(0, 10);
  const slug = brief.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  return (
    <aside
      aria-label="Region briefing"
      className="panel absolute bottom-4 right-4 top-16 z-20 flex w-[340px] max-w-[calc(100vw-2rem)] flex-col text-chalk"
    >
      <header className="flex items-start justify-between gap-2 border-b hairline px-4 py-3">
        <div className="min-w-0">
          <div className="label-caps text-[9px] text-chalk/45">Region briefing</div>
          <h2 className="mt-0.5 break-words font-display text-[16px] font-semibold leading-tight">
            {brief.label}
          </h2>
        </div>
        <button onClick={onClose} aria-label="Close" className="text-chalk/50 hover:text-chalk">
          ✕
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 font-mono text-[11px]">
          <Stat k="repos" v={formatCount(brief.n)} />
          <Stat k="models / datasets" v={`${formatCount(brief.nModels)} / ${formatCount(brief.nDatasets)}`} />
          <Stat k="downloads / mo" v={formatCount(brief.totalDownloads)} />
          <Stat k="median dl" v={formatCount(brief.medianDownloads)} />
        </dl>

        {brief.topTasks.length > 0 && (
          <TallyRow title="Top tasks" items={brief.topTasks} total={brief.n} />
        )}
        {brief.topLicenses.length > 0 && (
          <TallyRow title="Licenses" items={brief.topLicenses} total={brief.n} />
        )}

        <div className="mt-4 border-t hairline pt-3">
          <h3 className="label-caps text-[10px] text-chalk/60">Most downloaded</h3>
          <ul className="mt-1.5 space-y-0.5">
            {brief.topRepos.map((i) => (
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
      </div>

      <footer className="border-t hairline px-4 py-2.5">
        <button
          onClick={() =>
            download(`hublands-${slug}-${stamp}.csv`, "text/csv", toCsv(data, brief.members))
          }
          className="font-mono text-[12px] text-chalk/75 underline underline-offset-2 hover:text-chalk"
        >
          Download region as CSV ↓
        </button>
      </footer>
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

function TallyRow({
  title,
  items,
  total,
}: {
  title: string;
  items: { label: string; count: number }[];
  total: number;
}) {
  return (
    <div className="mt-3 border-t hairline pt-3">
      <h3 className="label-caps text-[10px] text-chalk/60">{title}</h3>
      <ul className="mt-1.5 space-y-1">
        {items.map((t) => (
          <li key={t.label} className="font-mono text-[11px]">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-chalk/80">{t.label}</span>
              <span className="shrink-0 text-chalk/45">{formatCount(t.count)}</span>
            </div>
            <div className="mt-0.5 h-[3px] w-full bg-chalk/10">
              <div className="h-full bg-chalk/40" style={{ width: `${(t.count / total) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
