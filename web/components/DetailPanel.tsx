"use client";

// Detail panel for the selected repo.

import { useEffect, useState } from "react";
import { formatCount, hubUrl, repoName, type AtlasData, type RepoDetail } from "../lib/data";
import { chartCoords } from "../lib/whimsy";
import type { SemanticState } from "./AtlasApp";

const STAR_KEY = "hublands-starred";

function readStars(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STAR_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export default function DetailPanel({
  detail,
  data,
  neighbors,
  semantic,
  onClose,
  onPick,
  onEnableSemantic,
}: {
  detail: RepoDetail;
  data: AtlasData;
  neighbors: Uint32Array | null;
  semantic: SemanticState;
  onClose: () => void;
  onPick: (i: number) => void;
  onEnableSemantic: () => void;
}) {
  const [starred, setStarred] = useState(false);
  useEffect(() => setStarred(readStars().includes(detail.id)), [detail.id]);

  const toggleStar = () => {
    const stars = readStars();
    const next = starred ? stars.filter((s) => s !== detail.id) : [...stars, detail.id];
    localStorage.setItem(STAR_KEY, JSON.stringify(next));
    setStarred(!starred);
  };

  const region = data.vocab.clusters.l2.find((c) => c.id === data.attrs.cluster_l2[detail.i])?.label;

  return (
    <aside
      aria-label="Repo details"
      className="panel absolute bottom-4 right-4 top-16 z-20 flex w-[340px] max-w-[calc(100vw-2rem)] flex-col text-chalk"
    >
      <header className="border-b hairline px-4 py-3">
        <div className="label-caps mb-1.5 flex items-center justify-between text-[9px] text-chalk/45">
          <span>Ship&apos;s log · entry no. {detail.i}</span>
          <span className="font-mono normal-case tracking-normal">
            {chartCoords(data.positions[detail.i * 2], data.positions[detail.i * 2 + 1])}
          </span>
        </div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-mono text-[11px] text-chalk/50">
              {detail.kind === 0 ? "● model" : "○ dataset"}
              {region ? ` · sighted in ${region}` : ""}
            </div>
            <h2 className="mt-0.5 break-all font-mono text-[14px] font-medium leading-tight">
              {detail.id}
            </h2>
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              onClick={toggleStar}
              aria-pressed={starred}
              aria-label={starred ? "Remove waypoint" : "Mark as waypoint"}
              className={starred ? "text-flare" : "text-chalk/50 hover:text-chalk"}
            >
              {starred ? "★" : "☆"}
            </button>
            <button onClick={onClose} aria-label="Close details" className="text-chalk/50 hover:text-chalk">
              ✕
            </button>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 font-mono text-[11px]">
          <Stat k="downloads / mo" v={formatCount(detail.downloads)} />
          <Stat k="likes" v={formatCount(detail.likes)} />
          {detail.task && <Stat k="task" v={detail.task} />}
          {detail.library && <Stat k="library" v={detail.library} />}
          {detail.license && <Stat k="license" v={detail.license} />}
          {detail.created && <Stat k="created" v={detail.created} />}
          {detail.updated && <Stat k="updated" v={detail.updated} />}
        </dl>

        {detail.summary && (
          <p className="mt-3 border-t hairline pt-3 text-[12.5px] leading-relaxed text-chalk/85">
            {detail.summary}
          </p>
        )}

        {detail.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {detail.tags.slice(0, 14).map((t) => (
              <span key={t} className="border hairline px-1.5 py-0.5 font-mono text-[10px] text-chalk/60">
                {t}
              </span>
            ))}
          </div>
        )}

        <div className="mt-4 border-t hairline pt-3">
          <h3 className="label-caps text-[10px] text-chalk/60">Sighted nearby</h3>
          {semantic === "ready" && neighbors ? (
            <ul className="mt-1.5 space-y-0.5">
              {Array.from(neighbors).map((i) => (
                <li key={i}>
                  <button
                    onClick={() => onPick(i)}
                    className="flex w-full items-baseline justify-between gap-2 py-0.5 text-left font-mono text-[11.5px] text-chalk/80 hover:text-chalk"
                  >
                    <span className="truncate">
                      <span aria-hidden className="mr-1 text-chalk/40">{data.attrs.kind[i] === 0 ? "●" : "○"}</span>
                      {repoName(data, i)}
                    </span>
                    <span className="shrink-0 text-chalk/40">{formatCount(data.attrs.downloads[i])}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <button
              onClick={onEnableSemantic}
              disabled={semantic === "loading"}
              className="mt-1.5 font-mono text-[11px] text-chalk/60 underline hover:text-chalk disabled:opacity-60"
            >
              {semantic === "loading" ? "loading model…" : "Enable semantic search to see neighbors"}
            </button>
          )}
        </div>
      </div>

      <footer className="border-t hairline px-4 py-2.5">
        <a
          href={hubUrl(detail.id, detail.kind)}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[12px] text-chalk/75 underline underline-offset-2 hover:text-chalk"
        >
          Open on Hugging Face ↗
        </a>
      </footer>
    </aside>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <>
      <div className="contents">
        <dt className="text-chalk/50">{k}</dt>
      </div>
      <div className="contents">
        <dd className="text-right text-chalk/90">{v}</dd>
      </div>
    </>
  );
}
