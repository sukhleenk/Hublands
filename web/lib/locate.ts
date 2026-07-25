/* Estimate where a piece of text would sit on the frozen map. UMAP.transform
   only runs offline, so the browser approximates position as the
   similarity-weighted centroid of the query's nearest neighbors. Honest and
   cheap: "your work sits among these repos." */

export function neighborhoodCentroid(
  positions: Float32Array,
  idx: Uint32Array,
  scores: Float32Array
): { x: number; y: number } {
  let sx = 0;
  let sy = 0;
  let sw = 0;
  const k = Math.min(idx.length, 12);
  for (let j = 0; j < k; j++) {
    // bias toward the closest matches so a split query lands on its
    // strongest cluster rather than in open water between two
    const w = Math.max(0, scores[j]) ** 2;
    const i = idx[j];
    sx += w * positions[i * 2];
    sy += w * positions[i * 2 + 1];
    sw += w;
  }
  if (sw === 0) return { x: 0, y: 0 };
  return { x: sx / sw, y: sy / sw };
}
