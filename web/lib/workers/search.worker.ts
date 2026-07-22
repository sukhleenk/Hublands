// Search worker. Name mode scans names.bin directly. Semantic mode runs
// MiniLM in transformers.js (same weights as the pipeline), projects the
// query through the shipped PCA, and ranks the int8 matrix by cosine.
// Also handles nearest-neighbor lookups for the detail panel.
interface InitMsg {
  type: "init";
  namesBlob: Uint8Array;
  nameOffsets: Uint32Array;
  downloads: Uint32Array;
}
interface NameMsg {
  type: "name";
  q: string;
  max: number;
}
interface EnableSemMsg {
  type: "enable-semantic";
  dataUrl: string;
}
interface MeaningMsg {
  type: "meaning";
  q: string;
  max: number;
}
interface NeighborsMsg {
  type: "neighbors";
  i: number;
  k: number;
}
type Msg = InitMsg | NameMsg | EnableSemMsg | MeaningMsg | NeighborsMsg;

let blob: Uint8Array; // lowercased
let offsets: Uint32Array;
let downloads: Uint32Array;

let sem: {
  mean: Float32Array;
  components: Float32Array; // [64][384]
  scales: Float32Array;
  vecs: Int8Array; // [N][64]
  norms: Float32Array;
  n: number;
  embed: (q: string) => Promise<Float32Array>;
} | null = null;

function lowercase(src: Uint8Array): Uint8Array {
  const out = new Uint8Array(src.length);
  for (let i = 0; i < src.length; i++) {
    const b = src[i];
    out[i] = b >= 65 && b <= 90 ? b + 32 : b;
  }
  return out;
}

/* Map a byte position in the blob to a point index. */
function posToIndex(pos: number): number {
  let lo = 0;
  let hi = offsets.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid] <= pos) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function nameScan(q: string, max: number): Uint32Array {
  const pattern = lowercase(new TextEncoder().encode(q));
  const m = pattern.length;
  if (m === 0 || m > 256) return new Uint32Array(0);

  const skip = new Uint8Array(256).fill(Math.min(m, 255));
  for (let i = 0; i < m - 1; i++) skip[pattern[i]] = Math.min(m - 1 - i, 255);

  const seen = new Set<number>();
  const n = blob.length;
  let pos = 0;
  while (pos <= n - m) {
    let j = m - 1;
    while (j >= 0 && blob[pos + j] === pattern[j]) j--;
    if (j < 0) {
      const idx = posToIndex(pos);
      // The match must not straddle two names.
      if (pos + m <= offsets[idx + 1]) seen.add(idx);
      pos += 1;
    } else {
      pos += skip[blob[pos + m - 1]];
    }
  }
  const result = Array.from(seen);
  result.sort((a, b) => downloads[b] - downloads[a]);
  return new Uint32Array(result.slice(0, max));
}

async function enableSemantic(dataUrl: string): Promise<void> {
  const [pcaBuf, vecBuf, { pipeline }] = await Promise.all([
    fetch(`${dataUrl}/sem/pca.bin`).then((r) => r.arrayBuffer()),
    fetch(`${dataUrl}/sem/int8_64.bin`).then((r) => r.arrayBuffer()),
    import("@huggingface/transformers"),
  ]);
  const mean = new Float32Array(pcaBuf, 0, 384);
  const components = new Float32Array(pcaBuf, 384 * 4, 64 * 384);
  const scales = new Float32Array(pcaBuf, (384 + 64 * 384) * 4, 64);
  const vecs = new Int8Array(vecBuf);
  const n = vecs.length / 64;
  const norms = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let d = 0; d < 64; d++) {
      const v = vecs[i * 64 + d] * scales[d];
      s += v * v;
    }
    norms[i] = Math.sqrt(s) || 1;
  }
  const extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  const embed = async (q: string) => {
    const out = await extractor(q, { pooling: "mean", normalize: true });
    return new Float32Array(out.data as Float32Array);
  };
  sem = { mean, components, scales, vecs, norms, n, embed };
}

function project(v: Float32Array): Float32Array {
  const { mean, components } = sem!;
  const y = new Float32Array(64);
  for (let j = 0; j < 64; j++) {
    let s = 0;
    const row = j * 384;
    for (let k = 0; k < 384; k++) s += (v[k] - mean[k]) * components[row + k];
    y[j] = s;
  }
  return y;
}

function rank(q64: Float32Array, max: number, exclude = -1): { idx: Uint32Array; scores: Float32Array } {
  const { vecs, scales, norms, n } = sem!;
  let qn = 0;
  for (let d = 0; d < 64; d++) qn += q64[d] * q64[d];
  qn = Math.sqrt(qn) || 1;
  const scores = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    const base = i * 64;
    for (let d = 0; d < 64; d++) s += q64[d] * vecs[base + d] * scales[d];
    scores[i] = s / (qn * norms[i]);
  }
  if (exclude >= 0) scores[exclude] = -Infinity;
  const order = Array.from({ length: n }, (_, i) => i);
  order.sort((a, b) => scores[b] - scores[a]);
  const top = order.slice(0, max);
  return { idx: new Uint32Array(top), scores: new Float32Array(top.map((i) => scores[i])) };
}

self.onmessage = async (e: MessageEvent<Msg>) => {
  const msg = e.data;
  if (msg.type === "init") {
    blob = lowercase(msg.namesBlob);
    offsets = msg.nameOffsets;
    downloads = msg.downloads;
    self.postMessage({ type: "ready" });
  } else if (msg.type === "name") {
    const idx = nameScan(msg.q, msg.max);
    self.postMessage({ type: "results", mode: "name", q: msg.q, idx }, { transfer: [idx.buffer] });
  } else if (msg.type === "enable-semantic") {
    try {
      await enableSemantic(msg.dataUrl);
      self.postMessage({ type: "semantic-ready" });
    } catch (err) {
      self.postMessage({ type: "semantic-error", message: String(err) });
    }
  } else if (msg.type === "meaning") {
    if (!sem) return;
    const v = await sem.embed(msg.q);
    const { idx, scores } = rank(project(v), msg.max);
    self.postMessage(
      { type: "results", mode: "meaning", q: msg.q, idx, scores },
      { transfer: [idx.buffer, scores.buffer] }
    );
  } else if (msg.type === "neighbors") {
    if (!sem) return;
    const { vecs, scales } = sem;
    const q64 = new Float32Array(64);
    for (let d = 0; d < 64; d++) q64[d] = vecs[msg.i * 64 + d] * scales[d];
    const { idx, scores } = rank(q64, msg.k, msg.i);
    self.postMessage(
      { type: "neighbors", i: msg.i, idx, scores },
      { transfer: [idx.buffer, scores.buffer] }
    );
  }
};
