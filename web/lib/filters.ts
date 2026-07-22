/* Filter state shared by the map, browse table, and URL. */
export interface FilterState {
  kind: "all" | "models" | "datasets";
  task: number; // vocab index, -1 = any
  library: number;
  license: number;
  minDownloads: number; // log10 floor, 0 = any
  fromWeek: number; // created range, -1 = open
  toWeek: number;
}

// log10, so 3 = 1k downloads/month
export const DEFAULT_MIN_DOWNLOADS = 3;

export const EMPTY_FILTERS: FilterState = {
  kind: "all",
  task: -1,
  library: -1,
  license: -1,
  minDownloads: DEFAULT_MIN_DOWNLOADS,
  fromWeek: -1,
  toWeek: -1,
};

export function filtersActive(f: FilterState): boolean {
  return (
    f.kind !== "all" ||
    f.task >= 0 ||
    f.library >= 0 ||
    f.license >= 0 ||
    f.minDownloads !== DEFAULT_MIN_DOWNLOADS ||
    f.fromWeek >= 0 ||
    f.toWeek >= 0
  );
}

export interface FilterableAttrs {
  kind: Uint8Array;
  task: Uint8Array;
  library: Uint8Array;
  license: Uint8Array;
  downloads: Uint32Array;
  created_week: Uint16Array;
}

/* One linear pass, sub-millisecond at 150k. Writes 1 or 0 per point into
   mask, which deck.gl then applies on the GPU. */
export function applyFilters(attrs: FilterableAttrs, f: FilterState, mask: Float32Array): void {
  const n = attrs.kind.length;
  const wantKind = f.kind === "all" ? -1 : f.kind === "models" ? 0 : 1;
  const minDl = f.minDownloads > 0 ? Math.pow(10, f.minDownloads) : 0;
  for (let i = 0; i < n; i++) {
    let ok = 1;
    if (wantKind >= 0 && attrs.kind[i] !== wantKind) ok = 0;
    else if (f.task >= 0 && attrs.task[i] !== f.task) ok = 0;
    else if (f.library >= 0 && attrs.library[i] !== f.library) ok = 0;
    else if (f.license >= 0 && attrs.license[i] !== f.license) ok = 0;
    else if (minDl > 0 && attrs.downloads[i] < minDl) ok = 0;
    else if (f.fromWeek >= 0 && attrs.created_week[i] < f.fromWeek) ok = 0;
    else if (f.toWeek >= 0 && attrs.created_week[i] > f.toWeek) ok = 0;
    mask[i] = ok;
  }
}
