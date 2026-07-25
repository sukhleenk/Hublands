"use client";

// "Where would my work land": paste an abstract or model card, embed it in
// the browser, and drop an estimated pin among its nearest neighbors.

import { formatCount, repoName, type AtlasData } from "../lib/data";
import { chartCoords } from "../lib/whimsy";
import type { SemanticState } from "./AtlasApp";

export interface LocateResult {
  x: number;
  y: number;
  neighbors: Uint32Array;
  scores: Float32Array;
}

export default function LocatePanel({
  data,
  text,
  result,
  busy,
  semantic,
  semBytes,
  onText,
  onLocate,
  onClose,
  onPick,
  onEnableSemantic,
}: {
  data: AtlasData;
  text: string;
  result: LocateResult | null;
  busy: boolean;
  semantic: SemanticState;
  semBytes: number;
  onText: (t: string) => void;
  onLocate: () => void;
  onClose: () => void;
  onPick: (i: number) => void;
  onEnableSemantic: () => void;
}) {
  const ready = semantic === "ready";
  const mb = (semBytes / 1e6).toFixed(1);

  return (
    <aside
      aria-label="Locate your work"
      className="panel absolute bottom-4 right-4 top-16 z-20 flex w-[340px] max-w-[calc(100vw-2rem)] flex-col text-chalk"
    >
      <header className="flex items-start justify-between gap-2 border-b hairline px-4 py-3">
        <div>
          <div className="label-caps text-[9px] text-chalk/45">Dead reckoning</div>
          <h2 className="mt-0.5 font-display text-[15px] font-semibold">Locate your work</h2>
        </div>
        <button onClick={onClose} aria-label="Close" className="text-chalk/50 hover:text-chalk">
          ✕
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <p className="text-[12px] leading-relaxed text-chalk/70">
          Paste a paper abstract, a model card, or a description. It gets
          embedded on your machine and placed among the repos it reads most
          like.
        </p>

        <textarea
          value={text}
          onChange={(e) => onText(e.target.value)}
          placeholder="We present a 7B parameter model for multilingual speech recognition…"
          rows={5}
          className="mt-3 w-full resize-y border hairline bg-transparent px-2.5 py-2 font-mono text-[12px] leading-relaxed text-chalk placeholder:text-chalk/35 focus:outline-none"
        />

        {ready ? (
          <button
            onClick={onLocate}
            disabled={busy || !text.trim()}
            className="mt-2 w-full border border-chalk/50 bg-chalk/10 px-3 py-1.5 font-mono text-[12px] text-chalk hover:bg-chalk/15 disabled:opacity-50"
          >
            {busy ? "reckoning…" : "Drop me on the chart"}
          </button>
        ) : (
          <button
            onClick={onEnableSemantic}
            disabled={semantic === "loading"}
            className="mt-2 w-full border hairline px-3 py-1.5 font-mono text-[12px] text-chalk/70 hover:text-chalk disabled:opacity-60"
            title="Placement needs the in-browser embedding model"
          >
            {semantic === "loading"
              ? "loading model…"
              : semantic === "error"
                ? "load failed, retry"
                : `Enable placement (${mb} MB, one time)`}
          </button>
        )}

        {result && (
          <div className="mt-4 border-t hairline pt-3">
            <div className="flex items-baseline justify-between">
              <h3 className="label-caps text-[10px] text-chalk/60">Estimated position</h3>
              <span className="font-mono text-[10px] text-chalk/50">
                {chartCoords(result.x, result.y)}
              </span>
            </div>
            <p className="mt-1 font-mono text-[10px] leading-relaxed text-chalk/45">
              Approximate. Placed at the center of its nearest neighbors, not a
              refit of the map.
            </p>
            <ul className="mt-2 space-y-0.5">
              {Array.from(result.neighbors).map((i, k) => (
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
                      {(result.scores[k] * 100).toFixed(0)}%
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </aside>
  );
}
