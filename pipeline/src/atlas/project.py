"""Stage 4: PCA(50) then frozen UMAP(2).

Reads interim/emb_f32.npy, writes interim/xy.npy [N, 2] normalized to a
fixed square, plus the fitted pca.joblib and umap_reducer.joblib.

The projection is frozen: fit() runs once, on the
initial corpus. Every refresh calls transform() to place new repos into
the existing layout. Refitting moves every point and breaks every shared
link, so it only ever happens as an announced v2.
"""

from __future__ import annotations

import argparse
import json

import joblib
import numpy as np

from atlas.common import INTERIM_DIR, ensure_dirs, get_logger

log = get_logger("project")

PCA_PATH = INTERIM_DIR / "pca.joblib"
UMAP_PATH = INTERIM_DIR / "umap_reducer.joblib"
NORM_PATH = INTERIM_DIR / "norm.json"

# Coordinates are normalized into this square with a small margin so the
# terrain raster has breathing room at the edges.
BOUND = 1.0
MARGIN = 0.94


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--refit", action="store_true",
                    help="allow refitting even if a fitted reducer exists (v2 cuts only)")
    args = ap.parse_args()
    ensure_dirs()

    emb = np.load(INTERIM_DIR / "emb_f32.npy")
    if args.limit:
        emb = emb[: args.limit]

    if UMAP_PATH.exists() and not args.refit:
        log.info("fitted reducer exists: transform() only, the map is frozen")
        pca = joblib.load(PCA_PATH)
        reducer = joblib.load(UMAP_PATH)
        norm = json.loads(NORM_PATH.read_text())
        emb50 = pca.transform(emb)
        raw = reducer.transform(emb50)
        xy = (raw - np.array(norm["center"])) * norm["scale"]
    else:
        from sklearn.decomposition import PCA
        from umap import UMAP

        log.info("fitting PCA(50) on %s", emb.shape)
        pca = PCA(n_components=50, random_state=42)
        emb50 = pca.fit_transform(emb)

        log.info("fitting UMAP(2), n_neighbors=15, min_dist=0.05, cosine")
        reducer = UMAP(
            n_components=2,
            n_neighbors=15,
            min_dist=0.05,
            metric="cosine",
            random_state=42,
            verbose=True,
        )
        raw = reducer.fit_transform(emb50)

        # Center on the layout's midpoint, scale the larger axis into the
        # margin. This normalization is frozen with the reducer.
        lo, hi = raw.min(axis=0), raw.max(axis=0)
        center = (lo + hi) / 2
        scale = (BOUND * MARGIN) / (np.abs(raw - center).max() + 1e-9)
        xy = (raw - center) * scale

        joblib.dump(pca, PCA_PATH)
        joblib.dump(reducer, UMAP_PATH)
        NORM_PATH.write_text(json.dumps({"center": center.tolist(), "scale": float(scale)}))
        log.info("persisted pca.joblib, umap_reducer.joblib, norm.json")

    np.save(INTERIM_DIR / "pca50.npy", emb50.astype(np.float32))
    np.save(INTERIM_DIR / "xy.npy", xy.astype(np.float32))
    log.info("wrote xy.npy %s, bounds x[%.3f, %.3f] y[%.3f, %.3f]",
             xy.shape, xy[:, 0].min(), xy[:, 0].max(), xy[:, 1].min(), xy[:, 1].max())


if __name__ == "__main__":
    main()
