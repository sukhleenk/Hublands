"use client";

// State owner for /map: data loading, URL sync, workers, selection.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { DATA_URL, indexOfRepo, loadAtlas, loadDetail, repoName, type AtlasData, type RepoDetail } from "../lib/data";
import { applyFilters, EMPTY_FILTERS, type FilterState } from "../lib/filters";
import { DEFAULT_URL_STATE, pushUrl, readUrl, type UrlState } from "../lib/url-state";
import type { ViewState } from "./MapCanvas";
import SearchBar from "./SearchBar";
import Legend from "./Legend";
import DetailPanel from "./DetailPanel";
import Tooltip from "./Tooltip";
import TopBar from "./TopBar";
import ChartFrame from "./ChartFrame";
import { applyTheme, currentTheme, type Theme } from "./ThemeToggle";
import { soundingLine } from "../lib/whimsy";

const MapCanvas = dynamic(() => import("./MapCanvas"), { ssr: false });

export type SemanticState = "idle" | "loading" | "ready" | "error";

export default function AtlasApp({ hero = false }: { hero?: boolean }) {
  const [data, setData] = useState<AtlasData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<UrlState>(DEFAULT_URL_STATE);
  const [mask, setMask] = useState<{ arr: Float32Array; epoch: number } | null>(null);
  const [matches, setMatches] = useState<Uint32Array | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<RepoDetail | null>(null);
  const [neighbors, setNeighbors] = useState<Uint32Array | null>(null);
  const [semantic, setSemantic] = useState<SemanticState>("idle");
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const [flyTo, setFlyTo] = useState<{ view: ViewState; epoch: number } | null>(null);

  const filterWorker = useRef<Worker | null>(null);
  const searchWorker = useRef<Worker | null>(null);
  const epochRef = useRef(0);
  const flyEpoch = useRef(0);
  const urlRef = useRef(url);
  urlRef.current = url;

  // Boot: read the URL, fetch the atlas, start the workers.
  useEffect(() => {
    // theme was already applied to <html> by the layout script
    const initial = hero
      ? { ...DEFAULT_URL_STATE, theme: currentTheme() }
      : { ...readUrl(window.location.search), theme: currentTheme() };
    setUrl(initial);

    let dead = false;
    loadAtlas()
      .then((d) => {
        if (dead) return;
        setData(d);
        // default filters include a downloads floor, so build the first
        // mask here instead of starting all-visible
        const m = new Float32Array(d.manifest.n_points);
        applyFilters(d.attrs, initial.filters, m);
        setMask({ arr: m, epoch: 0 });

        if (!hero) {
          const fw = new Worker(new URL("../lib/workers/filter.worker.ts", import.meta.url));
          fw.postMessage({
            type: "init",
            kind: d.attrs.kind,
            task: d.attrs.task,
            library: d.attrs.library,
            license: d.attrs.license,
            downloads: d.attrs.downloads,
            created_week: d.attrs.created_week,
          });
          fw.onmessage = (e) => {
            if (e.data.type === "mask" && e.data.epoch === epochRef.current) {
              setMask({ arr: e.data.mask, epoch: e.data.epoch });
            }
          };
          filterWorker.current = fw;

          const sw = new Worker(new URL("../lib/workers/search.worker.ts", import.meta.url));
          sw.postMessage({
            type: "init",
            namesBlob: d.namesBlob,
            nameOffsets: d.nameOffsets,
            downloads: d.attrs.downloads,
          });
          sw.onmessage = (e) => {
            const msg = e.data;
            if (msg.type === "results" && msg.q === urlRef.current.q) setMatches(msg.idx);
            else if (msg.type === "semantic-ready") setSemantic("ready");
            else if (msg.type === "semantic-error") setSemantic("error");
            else if (msg.type === "neighbors") setNeighbors(msg.idx);
          };
          searchWorker.current = sw;

          if (initial.sel) {
            const i = indexOfRepo(d, initial.sel);
            if (i >= 0) {
              setSelected(i);
              const view: ViewState = {
                target: [d.positions[i * 2], d.positions[i * 2 + 1], 0],
                zoom: initial.z ?? 4,
              };
              if (initial.x === null) setFlyTo({ view, epoch: ++flyEpoch.current });
            }
          }
        }
      })
      .catch((e) => setError(String(e)));
    return () => {
      dead = true;
      filterWorker.current?.terminate();
      searchWorker.current?.terminate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hero]);

  // Keep the URL a working permalink for every state change.
  useEffect(() => {
    if (!hero && data) pushUrl(url);
  }, [url, data, hero]);

  const setFilters = useCallback((f: FilterState) => {
    setUrl((u) => ({ ...u, filters: f }));
    epochRef.current += 1;
    filterWorker.current?.postMessage({ type: "filter", filters: f, epoch: epochRef.current });
  }, []);

  // debounced search
  useEffect(() => {
    if (!data || hero) return;
    const q = url.q.trim();
    if (!q) {
      setMatches(null);
      return;
    }
    const t = setTimeout(() => {
      if (url.mode === "meaning" && semantic === "ready") {
        searchWorker.current?.postMessage({ type: "meaning", q, max: 500 });
      } else {
        searchWorker.current?.postMessage({ type: "name", q, max: 500 });
      }
    }, 160);
    return () => clearTimeout(t);
  }, [url.q, url.mode, semantic, data, hero]);

  // Selection: load the details shard, ask for neighbors, sync URL.
  useEffect(() => {
    if (!data) return;
    if (selected === null) {
      setDetail(null);
      setNeighbors(null);
      setUrl((u) => (u.sel === null ? u : { ...u, sel: null }));
      return;
    }
    const id = repoName(data, selected);
    setUrl((u) => (u.sel === id ? u : { ...u, sel: id }));
    setDetail(null);
    loadDetail(data.manifest, selected).then((d) => setDetail(d ?? null));
    if (semantic === "ready") {
      searchWorker.current?.postMessage({ type: "neighbors", i: selected, k: 8 });
    } else {
      setNeighbors(null);
    }
  }, [selected, data, semantic]);

  const enableSemantic = useCallback(() => {
    setSemantic("loading");
    searchWorker.current?.postMessage({ type: "enable-semantic", dataUrl: new URL(DATA_URL, window.location.href).href });
  }, []);

  const onHover = useCallback((i: number | null, x: number, y: number) => {
    setHover((prev) => {
      if (i === null) return null;
      if (prev?.i !== i) {
        // fire the ping on the canvas
        document
          .querySelector("canvas[aria-label='Atlas map']")
          ?.dispatchEvent(new CustomEvent("atlas-ping", { detail: i }));
      }
      return { i, x, y };
    });
  }, []);

  const onViewChange = useCallback((v: ViewState) => {
    setUrl((u) => ({ ...u, x: v.target[0], y: v.target[1], z: v.zoom }));
  }, []);

  const focusIndex = useCallback(
    (i: number, zoom = 5) => {
      if (!data) return;
      setSelected(i);
      setFlyTo({
        view: { target: [data.positions[i * 2], data.positions[i * 2 + 1], 0], zoom },
        epoch: ++flyEpoch.current,
      });
    },
    [data]
  );

  const setTheme = useCallback((t: Theme) => {
    applyTheme(t);
    setUrl((u) => ({ ...u, theme: t }));
  }, []);

  // follow theme toggles from other components
  useEffect(() => {
    const onTheme = (e: Event) =>
      setUrl((u) => {
        const t = (e as CustomEvent<Theme>).detail;
        return u.theme === t ? u : { ...u, theme: t };
      });
    window.addEventListener("hublands-theme", onTheme);
    return () => window.removeEventListener("hublands-theme", onTheme);
  }, []);

  const semBytes = useMemo(() => {
    if (!data) return 0;
    const f = data.manifest.files;
    return (f["sem/int8_64.bin"]?.bytes ?? 0) + (f["sem/pca.bin"]?.bytes ?? 0);
  }, [data]);

  if (error) {
    return (
      <div className="flex h-dvh items-center justify-center bg-abyss p-8 text-chalk">
        <div className="max-w-md font-mono text-sm leading-relaxed">
          The atlas data failed to load ({error}). Check that the data files are
          published and reachable, then reload.
        </div>
      </div>
    );
  }

  if (!data || !mask) {
    return (
      <div className="flex h-dvh items-center justify-center bg-abyss text-chalk">
        <div className="label-caps animate-pulse text-sm tracking-widest">{soundingLine()}</div>
      </div>
    );
  }

  if (hero) {
    return (
      <div className="absolute inset-0">
        <MapCanvas
          data={data}
          theme={url.theme}
          mask={mask.arr}
          maskEpoch={mask.epoch}
          matches={null}
          selected={null}
          neighbors={null}
          hero
          initialView={null}
          flyTo={null}
        />
      </div>
    );
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-abyss">
      <SmallScreenNote />
      <ChartFrame />
      <MapCanvas
        data={data}
        theme={url.theme}
        mask={mask.arr}
        maskEpoch={mask.epoch}
        matches={matches}
        selected={selected}
        neighbors={neighbors}
        initialView={url.x !== null && url.y !== null && url.z !== null ? { target: [url.x, url.y, 0], zoom: url.z } : null}
        flyTo={flyTo}
        onViewChange={onViewChange}
        onHover={onHover}
        onClick={(i) => (i === null ? setSelected(null) : setSelected(i))}
      />

      <TopBar />

      <SearchBar
        q={url.q}
        mode={url.mode}
        semantic={semantic}
        semBytes={semBytes}
        matches={matches}
        data={data}
        onQuery={(q) => setUrl((u) => ({ ...u, q }))}
        onMode={(mode) => setUrl((u) => ({ ...u, mode }))}
        onEnableSemantic={enableSemantic}
        onPick={(i) => focusIndex(i)}
      />

      <Legend
        data={data}
        filters={url.filters}
        theme={url.theme}
        visibleCount={countMask(mask.arr)}
        onFilters={setFilters}
        onTheme={setTheme}
        onRegion={(x, y) => setFlyTo({ view: { target: [x, y, 0], zoom: 2 }, epoch: ++flyEpoch.current })}
      />

      {detail && selected !== null && (
        <DetailPanel
          detail={detail}
          data={data}
          neighbors={neighbors}
          semantic={semantic}
          onClose={() => setSelected(null)}
          onPick={(i) => focusIndex(i)}
          onEnableSemantic={enableSemantic}
        />
      )}

      {hover && selected !== hover.i && (
        <Tooltip data={data} index={hover.i} x={hover.x} y={hover.y} />
      )}
    </div>
  );
}

function SmallScreenNote() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className="panel absolute inset-x-3 bottom-3 z-40 flex items-center justify-between gap-3 px-3 py-2 font-mono text-[12px] text-chalk sm:hidden">
      <span>
        The chart works with touch, but the{" "}
        <a href="/browse" className="underline">list view</a> is easier on a phone.
      </span>
      <button onClick={() => setDismissed(true)} aria-label="Dismiss" className="text-chalk/60">
        ✕
      </button>
    </div>
  );
}

function countMask(m: Float32Array): number {
  let c = 0;
  for (let i = 0; i < m.length; i++) c += m[i];
  return c;
}
