/* Export a set of point indices as CSV or JSON, built entirely client-side
   from the arrays already in memory. Downloads a blob the user asked for. */

import { hubUrl, repoName, weekToDate, type AtlasData } from "./data";

export interface ExportRow {
  id: string;
  kind: "model" | "dataset";
  downloads: number;
  likes: number;
  task: string;
  library: string;
  license: string;
  created: string;
  url: string;
}

function rowFor(data: AtlasData, i: number): ExportRow {
  const a = data.attrs;
  const v = data.vocab;
  const kind = a.kind[i];
  return {
    id: repoName(data, i),
    kind: kind === 0 ? "model" : "dataset",
    downloads: a.downloads[i],
    likes: a.likes[i],
    task: a.task[i] !== 255 ? v.tasks[a.task[i]] : "",
    library: a.library[i] !== 255 ? v.libraries[a.library[i]] : "",
    license: a.license[i] !== 255 ? v.licenses[a.license[i]] : "",
    created: weekToDate(data.manifest.week_epoch, a.created_week[i]).toISOString().slice(0, 10),
    url: hubUrl(repoName(data, i), kind),
  };
}

const COLUMNS: (keyof ExportRow)[] = [
  "id",
  "kind",
  "downloads",
  "likes",
  "task",
  "library",
  "license",
  "created",
  "url",
];

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(data: AtlasData, indices: ArrayLike<number>): string {
  const lines = [COLUMNS.join(",")];
  for (let k = 0; k < indices.length; k++) {
    const r = rowFor(data, indices[k]);
    lines.push(COLUMNS.map((c) => csvCell(r[c])).join(","));
  }
  return lines.join("\n");
}

export function toJson(data: AtlasData, indices: ArrayLike<number>): string {
  const rows: ExportRow[] = [];
  for (let k = 0; k < indices.length; k++) rows.push(rowFor(data, indices[k]));
  return JSON.stringify(rows, null, 2);
}

export function repoIds(data: AtlasData, indices: ArrayLike<number>): string {
  const out: string[] = [];
  for (let k = 0; k < indices.length; k++) out.push(repoName(data, indices[k]));
  return out.join("\n");
}

export function download(filename: string, mime: string, text: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
