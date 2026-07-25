/* Box selection: given a world-space bounding box, return the indices of
   points that fall inside it and pass the current filter mask. One linear
   pass, sub-millisecond at 150k. */

export interface WorldBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function boxScan(
  positions: Float32Array,
  mask: Float32Array,
  box: WorldBox,
  limit = 100000
): Uint32Array {
  const n = mask.length;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (mask[i] === 0) continue;
    const x = positions[i * 2];
    const y = positions[i * 2 + 1];
    if (x < box.minX || x > box.maxX || y < box.minY || y > box.maxY) continue;
    out.push(i);
    if (out.length >= limit) break;
  }
  return new Uint32Array(out);
}

export function parseBox(s: string | null): WorldBox | null {
  if (!s) return null;
  const parts = s.split(",").map(Number);
  if (parts.length !== 4 || parts.some((v) => !Number.isFinite(v))) return null;
  const [minX, minY, maxX, maxY] = parts;
  return { minX, minY, maxX, maxY };
}

export function boxToString(b: WorldBox): string {
  return [b.minX, b.minY, b.maxX, b.maxY].map((v) => v.toFixed(4)).join(",");
}
