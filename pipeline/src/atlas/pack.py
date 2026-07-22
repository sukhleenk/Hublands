"""Stage 9: pack everything into the binary artifacts the app loads.

Reads raw/repos.parquet (row order IS point order), interim/xy.npy,
interim/clusters.npy, labels/labels.json. Writes into dist/v1/:

  positions.bin        Float32Array[2N] interleaved x, y
  attrs.bin            struct of arrays, offsets in the manifest
  names.bin            one UTF-8 blob of repo ids
  names_offsets.bin    Uint32Array[N + 1]
  vocab.json           tasks, libraries, licenses, clusters with centroids
  details/{s}.json.gz  shard = floor(i / 2048)
  manifest.json        counts, bounds, offsets, bytes + sha256 per file
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from atlas.common import (
    DATA_VERSION, DIST_DIR, EMBEDDING_MODEL, INTERIM_DIR, LABELS_DIR, RAW_DIR,
    WEEK_EPOCH, ensure_dirs, get_logger,
)

log = get_logger("pack")

SHARD = 2048
NONE = 255


def week_index(iso: str | None) -> int:
    if not iso:
        return 0
    try:
        d = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        return 0
    epoch = datetime.fromisoformat(WEEK_EPOCH).replace(tzinfo=timezone.utc)
    return int(np.clip((d - epoch).days // 7, 0, 65535))


def build_vocab(series: pd.Series) -> tuple[list[str], np.ndarray]:
    counts = series.dropna().value_counts()
    values = counts.index.tolist()[: NONE - 1]
    index = {v: i for i, v in enumerate(values)}
    codes = series.map(lambda v: index.get(v, NONE)).fillna(NONE).astype(np.uint8).to_numpy()
    return values, codes


def _s(v) -> str | None:
    """Pandas nulls (NaN, None, NA) become None; real strings pass through."""
    return v if isinstance(v, str) and v else None


def task_of(row) -> str | None:
    if _s(row["pipeline_tag"]):
        return row["pipeline_tag"]
    for t in row["tags"]:
        if t.startswith("task_categories:"):
            return t.split(":", 1)[1]
    return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()
    ensure_dirs()
    out = DIST_DIR / DATA_VERSION
    out.mkdir(parents=True, exist_ok=True)
    (out / "details").mkdir(exist_ok=True)

    df = pd.read_parquet(RAW_DIR / "repos.parquet")
    docs = pd.read_parquet(INTERIM_DIR / "docs.parquet")
    assert len(docs) == len(df), "docs.parquet and repos.parquet disagree on N"
    df["summary"] = docs["summary"].values
    xy = np.load(INTERIM_DIR / "xy.npy")
    clusters = np.load(INTERIM_DIR / "clusters.npy")
    if args.limit:
        df, xy, clusters = df.head(args.limit), xy[: args.limit], clusters[: args.limit]
    n = len(df)
    assert len(xy) == n and len(clusters) == n, "stage outputs disagree on N"
    labels = json.loads((LABELS_DIR / "labels.json").read_text())

    # positions.bin
    positions = xy.astype(np.float32).reshape(-1)
    (out / "positions.bin").write_bytes(positions.tobytes())

    # attrs.bin
    tasks_vocab, task_codes = build_vocab(df.apply(task_of, axis=1))
    libs_vocab, lib_codes = build_vocab(df["library_name"])
    lic_vocab, lic_codes = build_vocab(df["license"])
    arrays: list[tuple[str, np.ndarray]] = [
        ("kind", df["kind"].astype(np.uint8).to_numpy()),
        ("cluster_l1", clusters[:, 0].astype(np.uint16)),
        ("cluster_l2", clusters[:, 1].astype(np.uint16)),
        ("cluster_l3", clusters[:, 2].astype(np.uint16)),
        ("downloads", np.clip(df["downloads"].to_numpy(), 0, 2**32 - 1).astype(np.uint32)),
        ("likes", np.clip(df["likes"].to_numpy(), 0, 2**32 - 1).astype(np.uint32)),
        ("created_week", np.array([week_index(v) for v in df["created_at"]], dtype=np.uint16)),
        ("updated_week", np.array([week_index(v) for v in df["last_modified"]], dtype=np.uint16)),
        ("task", task_codes),
        ("library", lib_codes),
        ("license", lic_codes),
    ]
    # Pad each array up to its element alignment. A typed-array view in the
    # browser (new Uint32Array(buf, offset, n)) requires offset to be a
    # multiple of the element size, so u32 arrays must start on a multiple
    # of 4 and u16 on a multiple of 2. Without padding this depends on N and
    # silently breaks at some corpus sizes.
    offsets: dict[str, dict] = {}
    cursor = 0
    with open(out / "attrs.bin", "wb") as f:
        for name, arr in arrays:
            pad = (-cursor) % arr.dtype.itemsize
            if pad:
                f.write(b"\x00" * pad)
                cursor += pad
            b = arr.tobytes()
            offsets[name] = {"offset": cursor, "dtype": str(arr.dtype), "length": n}
            f.write(b)
            cursor += len(b)

    # names.bin + names_offsets.bin
    name_offsets = np.zeros(n + 1, dtype=np.uint32)
    blob = bytearray()
    for i, rid in enumerate(df["repo_id"]):
        blob.extend(rid.encode("utf-8"))
        name_offsets[i + 1] = len(blob)
    (out / "names.bin").write_bytes(bytes(blob))
    (out / "names_offsets.bin").write_bytes(name_offsets.tobytes())

    # vocab.json with cluster centroids
    def cluster_entries(level_idx: int, lvl: str) -> list[dict]:
        col = clusters[:, level_idx]
        entries = []
        for cid in np.unique(col):
            if cid == 0:
                continue
            mask = col == cid
            label = labels.get(lvl, {}).get(str(int(cid)), {}).get("label", f"{lvl}-{cid}")
            entries.append({
                "id": int(cid),
                "label": label,
                "x": round(float(np.median(xy[mask, 0])), 4),
                "y": round(float(np.median(xy[mask, 1])), 4),
                "n": int(mask.sum()),
            })
        entries.sort(key=lambda e: -e["n"])
        # number duplicate c-TF-IDF names
        seen: dict[str, int] = {}
        for e in entries:
            k = e["label"]
            seen[k] = seen.get(k, 0) + 1
            if seen[k] > 1:
                e["label"] = f"{k} {seen[k]}"
        return entries

    vocab = {
        "tasks": tasks_vocab,
        "libraries": libs_vocab,
        "licenses": lic_vocab,
        "clusters": {lvl: cluster_entries(i, lvl) for i, lvl in enumerate(("l1", "l2", "l3"))},
    }
    (out / "vocab.json").write_text(json.dumps(vocab, separators=(",", ":")))

    # details shards
    def short_date(iso) -> str | None:
        return iso[:10] if _s(iso) else None

    for s in range(0, n, SHARD):
        rows = []
        for i in range(s, min(s + SHARD, n)):
            r = df.iloc[i]
            rows.append({
                "i": i,
                "id": r["repo_id"],
                "kind": int(r["kind"]),
                "task": task_of(r),
                "library": _s(r["library_name"]),
                "license": _s(r["license"]),
                "downloads": int(r["downloads"]),
                "likes": int(r["likes"]),
                "created": short_date(r["created_at"]),
                "updated": short_date(r["last_modified"]),
                "tags": [t for t in r["tags"][:20]],
                "summary": _s(r["summary"]) or "",
            })
        with gzip.open(out / "details" / f"{s // SHARD}.json.gz", "wt") as f:
            json.dump(rows, f, separators=(",", ":"))

    # manifest.json
    files = {}
    for p in sorted(out.rglob("*")):
        if p.is_file() and p.name != "manifest.json":
            rel = str(p.relative_to(out))
            files[rel] = {
                "bytes": p.stat().st_size,
                "sha256": hashlib.sha256(p.read_bytes()).hexdigest(),
            }
    n_models = int((df["kind"] == 0).sum())
    manifest = {
        "version": DATA_VERSION,
        "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "n_points": n,
        "n_models": n_models,
        "n_datasets": n - n_models,
        "bounds": {"minX": -1, "minY": -1, "maxX": 1, "maxY": 1},
        "embedding_model": EMBEDDING_MODEL,
        "week_epoch": WEEK_EPOCH,
        "attrs": offsets,
        "shard_size": SHARD,
        "files": files,
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=1))

    total_mb = sum(f["bytes"] for f in files.values()) / 1e6
    log.info("packed %d points (%d models, %d datasets), %.1f MB total, %d shards",
             n, n_models, n - n_models, total_mb, (n + SHARD - 1) // SHARD)


if __name__ == "__main__":
    main()
