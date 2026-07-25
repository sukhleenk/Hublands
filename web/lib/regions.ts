/* Region briefing. Aggregates the attribute arrays already in memory into a
   summary for one L1 cluster: no extra data file, computed on click. */

import type { AtlasData } from "./data";

export interface Tally {
  label: string;
  count: number;
}

export interface RegionBrief {
  id: number;
  label: string;
  x: number;
  y: number;
  n: number;
  nModels: number;
  nDatasets: number;
  totalDownloads: number;
  medianDownloads: number;
  topRepos: number[]; // point indices, by downloads
  topTasks: Tally[];
  topLicenses: Tally[];
  members: Uint32Array; // all indices in the region, for export
}

function topTally(counts: Map<number, number>, vocab: string[], k: number): Tally[] {
  return [...counts.entries()]
    .filter(([idx]) => idx !== 255)
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([idx, count]) => ({ label: vocab[idx] ?? "unknown", count }));
}

export function regionBrief(data: AtlasData, id: number): RegionBrief | null {
  const entry = data.vocab.clusters.l1.find((c) => c.id === id);
  if (!entry) return null;
  const { cluster_l1, kind, downloads, task, license } = data.attrs;
  const n = cluster_l1.length;

  const members: number[] = [];
  const dls: number[] = [];
  let nModels = 0;
  let nDatasets = 0;
  let total = 0;
  const taskCounts = new Map<number, number>();
  const licCounts = new Map<number, number>();

  for (let i = 0; i < n; i++) {
    if (cluster_l1[i] !== id) continue;
    members.push(i);
    const d = downloads[i];
    dls.push(d);
    total += d;
    if (kind[i] === 0) nModels++;
    else nDatasets++;
    taskCounts.set(task[i], (taskCounts.get(task[i]) ?? 0) + 1);
    licCounts.set(license[i], (licCounts.get(license[i]) ?? 0) + 1);
  }

  if (members.length === 0) return null;

  dls.sort((a, b) => a - b);
  const mid = dls.length >> 1;
  const median = dls.length % 2 ? dls[mid] : Math.round((dls[mid - 1] + dls[mid]) / 2);

  const topRepos = [...members].sort((a, b) => downloads[b] - downloads[a]).slice(0, 8);

  return {
    id,
    label: entry.label,
    x: entry.x,
    y: entry.y,
    n: members.length,
    nModels,
    nDatasets,
    totalDownloads: total,
    medianDownloads: median,
    topRepos,
    topTasks: topTally(taskCounts, data.vocab.tasks, 5),
    topLicenses: topTally(licCounts, data.vocab.licenses, 4),
    members: new Uint32Array(members),
  };
}
