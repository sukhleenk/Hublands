"use client";

// Stats for /methods, read from the manifest.

import { useEffect, useState } from "react";
import { DATA_URL, formatCount, type Manifest } from "../lib/data";

export default function MethodsStats() {
  const [m, setM] = useState<Manifest | null>(null);
  useEffect(() => {
    fetch(`${DATA_URL}/manifest.json`)
      .then((r) => r.json())
      .then(setM)
      .catch(() => setM(null));
  }, []);

  if (!m) return null;
  const total = Object.values(m.files).reduce((s, f) => s + f.bytes, 0);
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-2 border hairline p-4 font-mono text-[12px] sm:grid-cols-3">
      <Stat k="points charted" v={formatCount(m.n_points)} />
      <Stat k="models" v={formatCount(m.n_models)} />
      <Stat k="datasets" v={formatCount(m.n_datasets)} />
      <Stat k="data on the wire" v={`${(total / 1e6).toFixed(1)} MB`} />
      <Stat k="embedding model" v="MiniLM-L6-v2" />
      <Stat k="last surveyed" v={new Date(m.built_at).toISOString().slice(0, 10)} />
    </dl>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-chalk/50">{k}</dt>
      <dd className="mt-0.5 text-chalk">{v}</dd>
    </div>
  );
}
