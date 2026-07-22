"""Stage 11: the weekly incremental orchestrator.

Never calls fit(). New repos are placed with transform() into the frozen
map; existing repos keep their exact coordinates byte for byte.

Steps:
  1. restore state (previous corpus + arrays + reducers) from the HF repo
     if not already on disk
  2. fetch fresh metadata and cards
  3. diff: new repos, changed repos (attrs update only), unchanged
  4. embed only new and changed cards
  5. pca.transform + umap.transform for new repos, append to xy
  6. assign clusters by nearest existing neighbor in PCA50 space, or 0
     (Unmapped) beyond the distance threshold
  7. re-run label reuse, raster, semantic, pack, publish
  8. report: added, changed, unmapped share, runtime

When Unmapped exceeds 5% of the corpus, stop and cut a v2 instead of
silently refitting. The report prints the number for exactly this reason.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import time

import joblib
import numpy as np
import pandas as pd

from atlas.common import INTERIM_DIR, RAW_DIR, ensure_dirs, get_logger
from atlas.fetch import fetch_cards, fetch_metadata
from atlas.clean import make_doc, make_summary, strip_card

log = get_logger("refresh")

# Cosine distance in PCA50 space beyond which a new repo is Unmapped.
NN_THRESHOLD = 0.35


def restore_state(repo: str) -> None:
    from huggingface_hub import hf_hub_download

    needed = {
        INTERIM_DIR / "xy.npy": "state/xy.npy",
        INTERIM_DIR / "clusters.npy": "state/clusters.npy",
        INTERIM_DIR / "pca50.npy": "state/pca50.npy",
        INTERIM_DIR / "emb_f32.npy": "state/emb_f32.npy",
        RAW_DIR / "repos.parquet": "state/repos.parquet",
        INTERIM_DIR / "pca.joblib": "reducers/pca.joblib",
        INTERIM_DIR / "umap_reducer.joblib": "reducers/umap_reducer.joblib",
        INTERIM_DIR / "sem_pca.joblib": "reducers/sem_pca.joblib",
        INTERIM_DIR / "norm.json": "reducers/norm.json",
    }
    for local, remote in needed.items():
        if not local.exists():
            log.info("restoring %s", remote)
            path = hf_hub_download(repo_id=repo, repo_type="dataset", filename=remote)
            local.parent.mkdir(parents=True, exist_ok=True)
            local.write_bytes(open(path, "rb").read())


def main() -> None:
    import asyncio
    import json

    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True, help="<namespace>/hublands-data")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--no-publish", action="store_true")
    args = ap.parse_args()
    ensure_dirs()
    t0 = time.time()

    restore_state(args.repo)

    old = pd.read_parquet(RAW_DIR / "repos.parquet")
    old_xy = np.load(INTERIM_DIR / "xy.npy")
    old_clusters = np.load(INTERIM_DIR / "clusters.npy")
    old_pca50 = np.load(INTERIM_DIR / "pca50.npy")
    old_emb = np.load(INTERIM_DIR / "emb_f32.npy")
    old_ids = {rid: i for i, rid in enumerate(old["repo_id"])}

    fresh = fetch_metadata(args.limit)
    fresh_by_id = {r.repo_id: r for r in fresh}
    new = [r for r in fresh if r.repo_id not in old_ids]
    asyncio.run(fetch_cards(new))
    log.info("fetched: %d total, %d new", len(fresh), len(new))

    # Update volatile attrs on existing rows without touching order.
    n_changed = sum(
        1 for rid, i in old_ids.items()
        if rid in fresh_by_id and fresh_by_id[rid].last_modified != old["last_modified"].iat[i]
    )
    for col in ("downloads", "likes", "trending_score", "last_modified", "tags"):
        updated = old[col].copy()
        for rid, i in old_ids.items():
            f = fresh_by_id.get(rid)
            if f is not None:
                updated.iat[i] = getattr(f, col)
        old[col] = updated

    if new:
        new_df = pd.DataFrame([r.__dict__ for r in new])
        new_df = new_df[(new_df["card"].str.len() > 0) | (new_df["tags"].map(len) > 0)]
        new_df["stripped"] = new_df["card"].map(strip_card)
        new_df["summary"] = new_df["stripped"].map(make_summary)
        new_df["doc"] = new_df.apply(make_doc, axis=1)

        from sentence_transformers import SentenceTransformer
        from atlas.common import EMBEDDING_MODEL

        model = SentenceTransformer(EMBEDDING_MODEL)
        new_emb = model.encode(
            new_df["doc"].tolist(), batch_size=256,
            normalize_embeddings=True, show_progress_bar=True,
        ).astype(np.float32)

        pca = joblib.load(INTERIM_DIR / "pca.joblib")
        reducer = joblib.load(INTERIM_DIR / "umap_reducer.joblib")
        norm = json.loads((INTERIM_DIR / "norm.json").read_text())
        new_pca50 = pca.transform(new_emb).astype(np.float32)
        raw_xy = reducer.transform(new_pca50)
        new_xy = ((raw_xy - np.array(norm["center"])) * norm["scale"]).astype(np.float32)

        from sklearn.neighbors import NearestNeighbors

        nn = NearestNeighbors(n_neighbors=1, metric="cosine").fit(old_pca50)
        dist, idx = nn.kneighbors(new_pca50)
        new_clusters = old_clusters[idx[:, 0]].copy()
        new_clusters[dist[:, 0] > NN_THRESHOLD] = 0

        merged = pd.concat(
            [old, new_df.drop(columns=["stripped", "doc"])], ignore_index=True
        )
        merged.to_parquet(RAW_DIR / "repos.parquet", index=False)
        np.save(INTERIM_DIR / "xy.npy", np.vstack([old_xy, new_xy]))
        np.save(INTERIM_DIR / "clusters.npy", np.vstack([old_clusters, new_clusters]))
        np.save(INTERIM_DIR / "pca50.npy", np.vstack([old_pca50, new_pca50]))
        np.save(INTERIM_DIR / "emb_f32.npy", np.vstack([old_emb, new_emb]))
    else:
        old.to_parquet(RAW_DIR / "repos.parquet", index=False)

    # Rebuild docs.parquet for label reuse (summaries for pack too).
    df = pd.read_parquet(RAW_DIR / "repos.parquet")
    df["stripped"] = df["card"].map(strip_card)
    df["summary"] = df["stripped"].map(make_summary)
    df["doc"] = df.apply(make_doc, axis=1)
    df.drop(columns=["card", "stripped"]).to_parquet(INTERIM_DIR / "docs.parquet", index=False)

    run = lambda mod: subprocess.run([sys.executable, "-m", f"atlas.{mod}"], check=True)
    run("label")
    run("raster")
    run("semantic")
    run("pack")
    if not args.no_publish:
        subprocess.run([sys.executable, "-m", "atlas.publish", "--repo", args.repo], check=True)

    clusters = np.load(INTERIM_DIR / "clusters.npy")
    unmapped = float((clusters[:, 2] == 0).mean())
    log.info("refresh report: %d added, %d changed, %.2f%% unmapped, %.0fs",
             len(new), n_changed, unmapped * 100, time.time() - t0)
    if unmapped > 0.05:
        log.warning("Unmapped exceeds 5%%: time to cut a v2 map (refit, publish under v2/)")


if __name__ == "__main__":
    main()
