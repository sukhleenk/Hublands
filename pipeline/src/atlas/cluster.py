"""Stage 5: HDBSCAN at three granularities.

Reads interim/emb_f32.npy (via the fitted PCA) and writes
interim/clusters.npy [N, 3] uint16: L1 continents, L2 countries, L3 towns.

Cluster id 0 is reserved for Unmapped (HDBSCAN noise, and on refresh any
repo that lands far from every existing cluster). Real clusters are 1..K.

Count targets, scaled down proportionally for small corpora so a
5k thin slice still produces a legible map:
  L1: 12 to 20    L2: 80 to 150    L3: 400 to 800
"""

from __future__ import annotations

import argparse

import joblib
import numpy as np
from sklearn.cluster import HDBSCAN

from atlas.common import INTERIM_DIR, ensure_dirs, get_logger

log = get_logger("cluster")

BANDS = {"l1": (12, 20), "l2": (80, 150), "l3": (400, 800)}
REFERENCE_N = 150_000


def scaled_band(level: str, n: int) -> tuple[int, int]:
    lo, hi = BANDS[level]
    s = max(0.08, min(1.0, n / REFERENCE_N))
    if level == "l1":
        return lo, hi  # continents do not shrink with corpus size
    # Keep the hierarchy strict on small corpora: countries must outnumber
    # continents and towns must outnumber countries.
    if level == "l2":
        return max(3 * BANDS["l1"][0], round(lo * s)), max(5 * BANDS["l1"][0], round(hi * s))
    return max(150, round(lo * s)), max(280, round(hi * s))


def run_level(x: np.ndarray, level: str) -> np.ndarray:
    n = len(x)
    lo, hi = scaled_band(level, n)
    target = (lo + hi) / 2

    # Search min_cluster_size around a heuristic guess and keep the run
    # whose cluster count lands nearest the band. Three candidates per
    # level keeps a 165k corpus tractable.
    guess = max(5, int(n / (target * 12)))
    grid = sorted({max(5, int(guess * f)) for f in (0.45, 1.0, 2.2)})
    best_labels, best_err, best_mcs = None, float("inf"), None
    for mcs in grid:
        if mcs >= n:
            continue
        labels = HDBSCAN(min_cluster_size=mcs, min_samples=10, n_jobs=-1).fit_predict(x)
        k = int(labels.max()) + 1
        err = 0.0 if lo <= k <= hi else min(abs(k - lo), abs(k - hi)) / target
        noise = float((labels == -1).mean())
        log.info("%s min_cluster_size=%d: %d clusters, %.0f%% noise", level, mcs, k, noise * 100)
        if err < best_err or (err == best_err and noise < 0.5):
            best_labels, best_err, best_mcs = labels, err, mcs
        if err == 0.0 and noise < 0.35:
            break

    k = int(best_labels.max()) + 1
    log.info("%s chose min_cluster_size=%d: %d clusters (band %d..%d)", level, best_mcs, k, lo, hi)

    # HDBSCAN calls a large share of points noise. A map where half the
    # territory is Unmapped is useless, so noise points join their nearest
    # cluster centroid when reasonably close, and stay 0 otherwise.
    labels = best_labels.copy()
    noise = labels == -1
    if noise.any() and k > 0:
        centroids = np.stack([x[labels == c].mean(axis=0) for c in range(k)])
        # A noise point joins cluster c if it sits within 1.5x that
        # cluster's own 90th percentile member distance.
        radii = np.array([
            np.percentile(np.linalg.norm(x[labels == c] - centroids[c], axis=1), 90)
            for c in range(k)
        ])
        from sklearn.metrics import pairwise_distances_argmin_min

        nearest, dmin = pairwise_distances_argmin_min(x[noise], centroids)
        close = dmin < 1.5 * radii[nearest]
        labels[noise] = np.where(close, nearest, -1)
        log.info("%s: rescued %.0f%% of %.0f%% noise", level,
                 100 * close.mean() * noise.mean(), 100 * noise.mean())

    return (labels + 1).astype(np.uint16)  # remaining -1 becomes 0 Unmapped


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()
    ensure_dirs()

    emb = np.load(INTERIM_DIR / "emb_f32.npy")
    if args.limit:
        emb = emb[: args.limit]
    pca = joblib.load(INTERIM_DIR / "pca.joblib")
    x = pca.transform(emb).astype(np.float32)

    cols = [run_level(x, lvl) for lvl in ("l1", "l2", "l3")]
    clusters = np.stack(cols, axis=1)
    np.save(INTERIM_DIR / "clusters.npy", clusters)

    for i, lvl in enumerate(("l1", "l2", "l3")):
        unmapped = float((clusters[:, i] == 0).mean())
        log.info("%s: %d clusters, %.1f%% unmapped", lvl, int(clusters[:, i].max()), unmapped * 100)


if __name__ == "__main__":
    main()
