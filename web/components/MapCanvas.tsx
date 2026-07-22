"use client";

// deck.gl map. Layer order, bottom to top: terrain, contours, points,
// matches, neighbor lines, selection, ping, labels.

import { useEffect, useRef } from "react";
import { Deck, OrthographicView, LinearInterpolator, type Layer } from "@deck.gl/core";
import { BitmapLayer, PathLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { DataFilterExtension, PathStyleExtension } from "@deck.gl/extensions";
import { DATA_URL, repoName, type AtlasData, type ClusterEntry } from "../lib/data";
import { l1Color } from "../lib/palette";

export interface ViewState {
  target: [number, number, number];
  zoom: number;
}

export interface MapCanvasProps {
  data: AtlasData;
  theme: "deep" | "chart";
  mask: Float32Array;
  maskEpoch: number;
  matches: Uint32Array | null; // query result indices, null = no query
  selected: number | null;
  neighbors: Uint32Array | null;
  hero?: boolean;
  initialView: ViewState | null;
  flyTo: { view: ViewState; epoch: number } | null;
  onViewChange?: (v: ViewState) => void;
  onHover?: (index: number | null, x: number, y: number) => void;
  onClick?: (index: number | null) => void;
}

interface Prepared {
  radii: Float32Array;
  fills: Uint8Array; // zoomed in: models filled, datasets rings
  lines: Uint8Array;
  farFills: Uint8Array; // zoomed out: everything filled
  farLines: Uint8Array;
  sweepVals: Float32Array; // interleaved [l1 id, reveal rank]
  maskVals: Float32Array; // interleaved [filter mask, reveal rank]
  appliedMaskEpoch: number;
  maxL1: number;
  maxRank: number;
}

const FILTER = new DataFilterExtension({ filterSize: 2 });
const DASH = new PathStyleExtension({ dash: true });

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function themeColors(theme: "deep" | "chart") {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => hexToRgb(css.getPropertyValue(name).trim());
  return {
    chalk: v("--chalk"),
    flare: v("--flare"),
    labelHalo: theme === "deep" ? hexToRgb("#071013") : hexToRgb("#f3ecda"),
  };
}

function prepare(data: AtlasData, theme: "deep" | "chart"): Prepared {
  const n = data.manifest.n_points;
  const { downloads, kind, cluster_l1 } = data.attrs;

  let maxDl = 1;
  for (let i = 0; i < n; i++) if (downloads[i] > maxDl) maxDl = downloads[i];
  const logMax = Math.log1p(maxDl);

  const clusterFill: Record<number, [number, number, number]> = {};
  const colorOf = (id: number) => (clusterFill[id] ??= l1Color(id, theme));

  const radii = new Float32Array(n);
  const fills = new Uint8Array(n * 4);
  const lines = new Uint8Array(n * 4);
  const farFills = new Uint8Array(n * 4);
  const farLines = new Uint8Array(n * 4);
  let maxL1 = 1;
  const rBase = theme === "deep" ? 1.1 : 0.9;
  const rSpan = 3.2;
  const fillAlpha = theme === "deep" ? 195 : 160;
  const ringAlpha = theme === "deep" ? 150 : 165;
  for (let i = 0; i < n; i++) {
    radii[i] = rBase + rSpan * (Math.log1p(downloads[i]) / logMax);
    const o = i * 4;
    const rgb = colorOf(cluster_l1[i]);
    // hollow rings are unreadable below ~3px, so far mode fills everything
    farFills[o] = rgb[0]; farFills[o + 1] = rgb[1]; farFills[o + 2] = rgb[2];
    farFills[o + 3] = kind[i] === 0 ? fillAlpha : 130;
    farLines[o + 3] = 0;
    if (kind[i] === 0) {
      fills[o] = rgb[0]; fills[o + 1] = rgb[1]; fills[o + 2] = rgb[2]; fills[o + 3] = fillAlpha;
      lines[o + 3] = 0;
    } else {
      fills[o + 3] = 0;
      lines[o] = rgb[0]; lines[o + 1] = rgb[1]; lines[o + 2] = rgb[2]; lines[o + 3] = ringAlpha;
    }
    if (cluster_l1[i] > maxL1) maxL1 = cluster_l1[i];
  }

  // Rank points within a coarse grid cell by downloads. The rank feeds a
  // zoom-dependent visibility cutoff so the overview stays sparse.
  const G = 96;
  const cellOf = (i: number) => {
    const gx = Math.min(G - 1, Math.max(0, Math.floor(((data.positions[i * 2] + 1) / 2) * G)));
    const gy = Math.min(G - 1, Math.max(0, Math.floor(((data.positions[i * 2 + 1] + 1) / 2) * G)));
    return gy * G + gx;
  };
  const order = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => cellOf(a) - cellOf(b) || downloads[b] - downloads[a]
  );
  const sweepVals = new Float32Array(n * 2);
  const maskVals = new Float32Array(n * 2);
  let prevCell = -1;
  let r = 0;
  let maxRank = 0;
  for (const i of order) {
    const cell = cellOf(i);
    if (cell !== prevCell) {
      prevCell = cell;
      r = 0;
    }
    sweepVals[i * 2 + 1] = r;
    maskVals[i * 2 + 1] = r;
    if (r > maxRank) maxRank = r;
    r += 1;
  }
  for (let i = 0; i < n; i++) {
    sweepVals[i * 2] = cluster_l1[i];
    maskVals[i * 2] = 1;
  }
  return { radii, fills, lines, farFills, farLines, sweepVals, maskVals, appliedMaskEpoch: -1, maxL1, maxRank };
}

export default function MapCanvas(props: MapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const deckRef = useRef<Deck<OrthographicView> | null>(null);
  const preparedRef = useRef<Prepared | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const viewRef = useRef<ViewState | null>(null);
  const fitZoomRef = useRef(8);
  const introRef = useRef({ phase: "contours" as "contours" | "points" | "labels" | "done", t0: 0 });
  const pingRef = useRef<{ index: number; t0: number } | null>(null);
  const rafRef = useRef(0);
  const settleRef = useRef(0);
  const fontsReadyRef = useRef(false);

  function redraw() {
    const deck = deckRef.current;
    const prep = preparedRef.current;
    if (!deck || !prep) return;
    const p = propsRef.current;
    const { data } = p;
    const n = data.manifest.n_points;
    const now = performance.now();
    const intro = introRef.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || p.hero) intro.phase = "done";

    // intro: contours 0-800ms, points 800-1800ms, labels to 2300ms
    let introProgress = 1;
    let needsAnimation = false;
    if (intro.phase !== "done") {
      if (!intro.t0) intro.t0 = now;
      const t = now - intro.t0;
      if (t < 800) intro.phase = "contours";
      else if (t < 1800) intro.phase = "points";
      else if (t < 2300) intro.phase = "labels";
      else intro.phase = "done";
      introProgress = Math.min(1, t / 2300);
      needsAnimation = intro.phase !== "done";
    }
    const contourOpacity = intro.phase === "done" ? 1 : Math.min(1, (now - intro.t0) / 800);
    const pointsSweep =
      intro.phase === "done" || intro.phase === "labels"
        ? 1
        : intro.phase === "points"
          ? Math.min(1, (now - intro.t0 - 800) / 1000)
          : 0;
    const labelsOpacity =
      intro.phase === "done" ? 1 : intro.phase === "labels" ? Math.min(1, (now - intro.t0 - 1800) / 500) : 0;

    const c = themeColors(p.theme);
    const dimmed = p.matches !== null;
    const terrainUrl = `${DATA_URL}/${p.theme === "chart" ? "terrain_light.webp" : "terrain.webp"}`;

    // channel 0 = l1 id while the intro sweeps, then the filter mask;
    // channel 1 = reveal rank
    const sweeping = pointsSweep < 1;
    if (prep.appliedMaskEpoch !== p.maskEpoch) {
      for (let i = 0; i < n; i++) prep.maskVals[i * 2] = p.mask[i];
      prep.appliedMaskEpoch = p.maskEpoch;
    }
    const filterValue = sweeping ? prep.sweepVals : prep.maskVals;

    // skip the lowest iso on the dark theme, it washes out the terrain
    const contourPaths: { path: number[][]; level: number }[] = [];
    for (const f of data.contours.features) {
      const level = (f.properties as { level: number }).level;
      if (p.theme === "deep" && level === 0) continue;
      const geom = f.geometry as GeoJSON.MultiLineString;
      for (const path of geom.coordinates) contourPaths.push({ path: path as unknown as number[][], level });
    }

    const zoom = viewRef.current?.zoom ?? fitZoomRef.current;
    const relZoom = zoom - fitZoomRef.current;

    // ~1 point per grid cell at the base zoom, 4x per zoom level (cells
    // on screen shrink at the same rate), everything past relZoom 4
    const budget =
      relZoom >= 4 ? prep.maxRank + 1 : Math.pow(4, Math.max(0, relZoom));
    const near = relZoom >= 2;
    const filterRange: [number, number][] = [
      sweeping ? [-0.5, prep.maxL1 * pointsSweep + 0.5] : [0.5, 1.5],
      [-0.5, budget],
    ];

    const matchSet = p.matches;
    const sel = p.selected;
    const px = (i: number) => data.positions[i * 2];
    const py = (i: number) => data.positions[i * 2 + 1];

    const fontDisplay = getComputedStyle(document.documentElement)
      .getPropertyValue("--font-fraunces")
      .trim() || "serif";

    // shared character set so all three label layers use one font atlas;
    // per-layer "auto" sets thrash the atlas cache and glyphs drop out
    const charset = Array.from(
      new Set(
        [data.vocab.clusters.l1, data.vocab.clusters.l2, data.vocab.clusters.l3]
          .flat()
          .flatMap((e) => e.label.split(""))
          .concat([" ", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"])
      )
    );

    const textLayer = (
      lvl: "l1" | "l2" | "l3",
      entries: ClusterEntry[],
      size: number,
      minRel: number,
      alpha: number
    ) =>
      fontsReadyRef.current &&
      relZoom >= minRel &&
      labelsOpacity > 0 &&
      new TextLayer<ClusterEntry>({
        id: `labels-${lvl}`,
        data: entries,
        getPosition: (d) => [d.x, d.y],
        getText: (d) => d.label,
        getSize: size,
        sizeUnits: "pixels",
        fontFamily: fontDisplay,
        fontWeight: 600,
        characterSet: charset,
        // wide halo + background chip; labels land on cluster centroids
        // where the terrain is brightest, so outline alone is not enough
        fontSettings: { sdf: true, smoothing: 0.25, radius: 16, buffer: 8 },
        outlineWidth: 5,
        outlineColor: [...c.labelHalo, 255] as [number, number, number, number],
        background: true,
        getBackgroundColor: [...c.labelHalo, Math.round(150 * labelsOpacity)] as [number, number, number, number],
        backgroundPadding: [7, 3, 7, 3],
        getColor: [...c.chalk, Math.round(alpha * labelsOpacity)] as [number, number, number, number],
        ...({
          parameters: { depthCompare: "always" },
        } as object),
      });

    // greedy label decluttering in screen space, biggest clusters win
    const keptBoxes: { x: number; y: number; w: number; h: number }[] = [];
    const declutter = (entries: ClusterEntry[], lvl: "l1" | "l2" | "l3", size: number) => {
      const scale = Math.pow(2, zoom);
      const cx = viewRef.current?.target[0] ?? 0;
      const cy = viewRef.current?.target[1] ?? 0;
      const out: ClusterEntry[] = [];
      const sorted = [...entries].sort((a, b) => b.n - a.n);
      for (const e of sorted) {
        const sx = (e.x - cx) * scale;
        const sy = (e.y - cy) * scale;
        const w = e.label.length * size * 0.56 + 10;
        const h = size + 12;
        const box = { x: sx - w / 2, y: sy - h / 2, w, h };
        const hits = keptBoxes.some(
          (k) => box.x < k.x + k.w && k.x < box.x + box.w && box.y < k.y + k.h && k.y < box.y + box.h
        );
        if (!hits) {
          keptBoxes.push(box);
          out.push(e);
        }
      }
      return out;
    };

    const layers: (Layer | false | null | undefined)[] = [
      new BitmapLayer({
        id: "terrain",
        parameters: { depthWriteEnabled: false },
        bounds: [-1, -1, 1, 1],
        image: terrainUrl,
        opacity: contourOpacity,
      }),
      new PathLayer<{ path: number[][]; level: number }>({
        id: "contours",
        parameters: { depthWriteEnabled: false },
        data: contourPaths,
        getPath: (d) => d.path.flat(),
        positionFormat: "XY",
        getColor: (d) =>
          (d.level === 1
            ? [...c.chalk, p.theme === "deep" ? 95 : 150]
            : [...c.chalk, d.level === 0 ? 36 : p.theme === "deep" ? 38 : 55]) as [number, number, number, number],
        getWidth: (d) => (d.level === 1 ? 1.4 : 0.9),
        widthUnits: "pixels",
        widthMinPixels: 0.5,
        opacity: contourOpacity * 0.9,
      }),
      new ScatterplotLayer({
        id: "points",
        parameters: { depthWriteEnabled: false },
        data: {
          length: n,
          attributes: {
            getPosition: { value: data.positions, size: 2 },
            getRadius: { value: prep.radii, size: 1 },
            getFillColor: { value: near ? prep.fills : prep.farFills, size: 4 },
            getLineColor: { value: near ? prep.lines : prep.farLines, size: 4 },
            getFilterValue: { value: filterValue, size: 2 },
          },
        },
        pickable: !p.hero,
        radiusUnits: "pixels",
        radiusMinPixels: 1,
        radiusMaxPixels: 5,
        stroked: near,
        filled: true,
        lineWidthUnits: "pixels",
        getLineWidth: 0.8,
        opacity: dimmed ? (p.theme === "deep" ? 0.18 : 0.3) : 0.85,
        extensions: [FILTER],
        filterRange,
        updateTriggers: { getFilterValue: [sweeping, p.maskEpoch], getFillColor: [near], getLineColor: [near] },
        onHover: (info) => p.onHover?.(info.index >= 0 ? info.index : null, info.x, info.y),
        onClick: (info) => p.onClick?.(info.index >= 0 ? info.index : null),
      }),
      matchSet &&
        new ScatterplotLayer<number>({
          id: "matches",
        parameters: { depthWriteEnabled: false },
          data: Array.from(matchSet.slice(0, 2000)),
          getPosition: (i) => [px(i), py(i)],
          getRadius: (i) => Math.max(2, prep.radii[i]),
          radiusUnits: "pixels",
          stroked: true,
          filled: true,
          getFillColor: (i) =>
            data.attrs.kind[i] === 0
              ? ([prep.fills[i * 4], prep.fills[i * 4 + 1], prep.fills[i * 4 + 2], 235] as [number, number, number, number])
              : [0, 0, 0, 0],
          getLineColor: [...c.chalk, 255] as [number, number, number, number],
          getLineWidth: 1,
          lineWidthUnits: "pixels",
          pickable: true,
          onHover: (info) =>
            p.onHover?.(info.object !== undefined && info.index >= 0 ? (info.object as number) : null, info.x, info.y),
          onClick: (info) => p.onClick?.(info.object !== undefined ? (info.object as number) : null),
        }),
      sel !== null &&
        p.neighbors &&
        new PathLayer<number>({
          id: "neighbor-lines",
          parameters: { depthWriteEnabled: false },
          data: Array.from(p.neighbors),
          getPath: (i) => [px(sel), py(sel), px(i), py(i)],
          positionFormat: "XY",
          getColor: [...c.chalk, 120] as [number, number, number, number],
          getWidth: 1,
          widthUnits: "pixels",
          widthMinPixels: 1,
          extensions: [DASH],
          ...({ getDashArray: [5, 4], dashJustified: false } as object),
        }),
      sel !== null &&
        new ScatterplotLayer({
          id: "selection",
        parameters: { depthWriteEnabled: false },
          data: [sel],
          getPosition: (i: number) => [px(i), py(i)],
          getRadius: 9,
          radiusUnits: "pixels",
          stroked: true,
          filled: false,
          getLineColor: [...c.flare, 255] as [number, number, number, number],
          getLineWidth: 1.5,
          lineWidthUnits: "pixels",
        }),
    ];

    // hover ping, one expanding ring
    const ping = pingRef.current;
    if (ping && !reduced) {
      const t = (now - ping.t0) / 900;
      if (t < 1) {
        layers.push(
          new ScatterplotLayer({
            id: "ping",
        parameters: { depthWriteEnabled: false },
            data: [ping.index],
            getPosition: (i: number) => [px(i), py(i)],
            getRadius: 6 + t * 26,
            radiusUnits: "pixels",
            stroked: true,
            filled: false,
            getLineColor: [...c.chalk, Math.round(160 * (1 - t))] as [number, number, number, number],
            getLineWidth: 1,
            lineWidthUnits: "pixels",
            updateTriggers: { getRadius: t, getLineColor: t },
          })
        );
        needsAnimation = true;
      } else {
        pingRef.current = null;
      }
    }

    if (!p.hero) {
      layers.push(
        textLayer("l1", declutter(data.vocab.clusters.l1, "l1", 20), 20, -Infinity, 255),
        textLayer("l2", declutter(data.vocab.clusters.l2.filter((e) => e.n >= 8), "l2", 15), 15, 1.4, 235),
        textLayer("l3", declutter(data.vocab.clusters.l3.filter((e) => e.n >= 5), "l3", 13), 13, 2.8, 215)
      );
    }

    deck.setProps({ layers: layers.filter(Boolean) as never });

    if (needsAnimation) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(redraw);
    } else if (introProgress >= 1 && intro.phase !== "done") {
      intro.phase = "done";
    }

    // font atlas can finish loading after the last frame of a burst;
    // force a couple of late repaints or labels stay blank
    if (!needsAnimation) {
      window.clearTimeout(settleRef.current);
      settleRef.current = window.setTimeout(() => {
        deckRef.current?.redraw("force");
        settleRef.current = window.setTimeout(() => deckRef.current?.redraw("force"), 900);
      }, 180);
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const p = propsRef.current;
    const rect = canvas.parentElement!.getBoundingClientRect();
    const fitZoom = Math.log2(Math.min(rect.width, rect.height) / 2.15);
    fitZoomRef.current = fitZoom;
    // points sit well inside the [-1,1] square, start a bit closer
    const initial: ViewState = p.initialView ?? { target: [0, 0, 0], zoom: fitZoom + 0.35 };
    viewRef.current = initial;

    preparedRef.current = prepare(p.data, p.theme);
    introRef.current = { phase: "contours", t0: 0 };

    const deck = new Deck({
      canvas,
      views: new OrthographicView({ flipY: false }),
      controller: p.hero ? { scrollZoom: false, doubleClickZoom: false } : { inertia: 260 },
      initialViewState: { ...initial, minZoom: fitZoom - 0.8, maxZoom: fitZoom + 8 },
      onViewStateChange: ({ viewState }) => {
        const vs = viewState as unknown as ViewState & { zoom: number };
        viewRef.current = { target: vs.target, zoom: vs.zoom };
        propsRef.current.onViewChange?.(viewRef.current);
        redraw();
      },
      getCursor: ({ isDragging, isHovering }) =>
        isDragging ? "grabbing" : isHovering ? "pointer" : "crosshair",
      layers: [],
    });
    deckRef.current = deck;
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as Record<string, unknown>).__deck = deck;
    }

    const fam = getComputedStyle(document.documentElement).getPropertyValue("--font-fraunces").trim();
    document.fonts.load(`600 16px ${fam}`).then(() => {
      fontsReadyRef.current = true;
      redraw();
    });

    redraw();
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.clearTimeout(settleRef.current);
      deck.finalize();
      deckRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.data, props.hero]);

  useEffect(() => {
    if (!deckRef.current) return;
    preparedRef.current = prepare(props.data, props.theme);
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.theme]);

  useEffect(() => {
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.mask, props.maskEpoch, props.matches, props.selected, props.neighbors]);

  useEffect(() => {
    if (!props.flyTo || !deckRef.current) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // don't land wider than a readable neighborhood
    const zoom = props.flyTo.view.zoom < fitZoomRef.current
      ? fitZoomRef.current + Math.max(1.5, props.flyTo.view.zoom - 2)
      : props.flyTo.view.zoom;
    deckRef.current.setProps({
      initialViewState: {
        ...props.flyTo.view,
        zoom,
        minZoom: fitZoomRef.current - 0.8,
        maxZoom: fitZoomRef.current + 8,
        transitionDuration: reduced ? 0 : 600,
        transitionInterpolator: new LinearInterpolator(["target", "zoom"]),
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.flyTo?.epoch]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onPing = (e: Event) => {
      const idx = (e as CustomEvent<number>).detail;
      pingRef.current = { index: idx, t0: performance.now() };
      redraw();
    };
    el.addEventListener("atlas-ping", onPing);
    return () => el.removeEventListener("atlas-ping", onPing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={canvasRef} className="h-full w-full" aria-label="Atlas map" role="img" />;
}

export function nameOf(data: AtlasData, i: number): string {
  return repoName(data, i);
}
