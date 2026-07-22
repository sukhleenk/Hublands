export const DATA_URL = (process.env.NEXT_PUBLIC_DATA_URL ?? "/data/v1").replace(/\/$/, "");

export interface Manifest {
  version: string;
  built_at: string;
  n_points: number;
  n_models: number;
  n_datasets: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  embedding_model: string;
  week_epoch: string;
  attrs: Record<string, { offset: number; dtype: string; length: number }>;
  shard_size: number;
  files: Record<string, { bytes: number; sha256: string }>;
}

export interface ClusterEntry {
  id: number;
  label: string;
  x: number;
  y: number;
  n: number;
}

export interface Vocab {
  tasks: string[];
  libraries: string[];
  licenses: string[];
  clusters: { l1: ClusterEntry[]; l2: ClusterEntry[]; l3: ClusterEntry[] };
}

export interface Attrs {
  kind: Uint8Array;
  cluster_l1: Uint16Array;
  cluster_l2: Uint16Array;
  cluster_l3: Uint16Array;
  downloads: Uint32Array;
  likes: Uint32Array;
  created_week: Uint16Array;
  updated_week: Uint16Array;
  task: Uint8Array;
  library: Uint8Array;
  license: Uint8Array;
}

export interface RepoDetail {
  i: number;
  id: string;
  kind: number;
  task: string | null;
  library: string | null;
  license: string | null;
  downloads: number;
  likes: number;
  created: string | null;
  updated: string | null;
  tags: string[];
  summary: string;
}

export interface AtlasData {
  manifest: Manifest;
  vocab: Vocab;
  positions: Float32Array;
  attrs: Attrs;
  namesBlob: Uint8Array;
  nameOffsets: Uint32Array;
  contours: GeoJSON.FeatureCollection;
}

const DTYPES: Record<string, { ctor: new (b: ArrayBuffer, o: number, n: number) => ArrayLike<number>; bytes: number }> = {
  uint8: { ctor: Uint8Array as never, bytes: 1 },
  uint16: { ctor: Uint16Array as never, bytes: 2 },
  uint32: { ctor: Uint32Array as never, bytes: 4 },
};

async function fetchBuffer(path: string): Promise<ArrayBuffer> {
  const r = await fetch(`${DATA_URL}/${path}`);
  if (!r.ok) throw new Error(`fetch ${path}: ${r.status}`);
  return r.arrayBuffer();
}

/* .json.gz artifacts are served raw by the HF CDN, so decompress here. */
export async function fetchGzJson<T>(path: string): Promise<T> {
  const r = await fetch(`${DATA_URL}/${path}`);
  if (!r.ok) throw new Error(`fetch ${path}: ${r.status}`);
  const buf = await r.arrayBuffer();
  // If a proxy already decoded the gzip, the buffer starts with "[" or "{".
  const head = new Uint8Array(buf, 0, 2);
  if (head[0] !== 0x1f || head[1] !== 0x8b) {
    return JSON.parse(new TextDecoder().decode(buf)) as T;
  }
  const stream = new Response(buf).body!.pipeThrough(new DecompressionStream("gzip"));
  return (await new Response(stream).json()) as T;
}

export async function loadAtlas(): Promise<AtlasData> {
  const manifest = (await (await fetch(`${DATA_URL}/manifest.json`)).json()) as Manifest;
  const [positionsBuf, attrsBuf, namesBuf, offsetsBuf, vocab, contours] = await Promise.all([
    fetchBuffer("positions.bin"),
    fetchBuffer("attrs.bin"),
    fetchBuffer("names.bin"),
    fetchBuffer("names_offsets.bin"),
    (await fetch(`${DATA_URL}/vocab.json`)).json() as Promise<Vocab>,
    fetchGzJson<GeoJSON.FeatureCollection>("contours.json.gz"),
  ]);

  const attrs = {} as Record<string, ArrayLike<number>>;
  for (const [name, spec] of Object.entries(manifest.attrs)) {
    const d = DTYPES[spec.dtype];
    if (!d) throw new Error(`unknown dtype ${spec.dtype}`);
    attrs[name] = new d.ctor(attrsBuf, spec.offset, spec.length);
  }

  return {
    manifest,
    vocab,
    positions: new Float32Array(positionsBuf),
    attrs: attrs as unknown as Attrs,
    namesBlob: new Uint8Array(namesBuf),
    nameOffsets: new Uint32Array(offsetsBuf),
    contours,
  };
}

export function repoName(data: Pick<AtlasData, "namesBlob" | "nameOffsets">, i: number): string {
  return new TextDecoder().decode(
    data.namesBlob.subarray(data.nameOffsets[i], data.nameOffsets[i + 1])
  );
}

/* Find a point index by exact repo id, via the byte blob. */
export function indexOfRepo(data: Pick<AtlasData, "namesBlob" | "nameOffsets">, id: string): number {
  const n = data.nameOffsets.length - 1;
  for (let i = 0; i < n; i++) {
    if (repoName(data, i) === id) return i;
  }
  return -1;
}

const shardCache = new Map<number, Promise<RepoDetail[]>>();

export function loadDetail(manifest: Manifest, i: number): Promise<RepoDetail | undefined> {
  const shard = Math.floor(i / manifest.shard_size);
  if (!shardCache.has(shard)) {
    shardCache.set(shard, fetchGzJson<RepoDetail[]>(`details/${shard}.json.gz`));
  }
  return shardCache.get(shard)!.then((rows) => rows.find((r) => r.i === i));
}

export function weekToDate(epoch: string, week: number): Date {
  const d = new Date(epoch + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + week * 7);
  return d;
}

export function formatCount(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(n);
}

export function hubUrl(id: string, kind: number): string {
  return kind === 1 ? `https://huggingface.co/datasets/${id}` : `https://huggingface.co/${id}`;
}
