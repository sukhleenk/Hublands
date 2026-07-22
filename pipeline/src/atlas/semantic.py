"""Stage 8: compact vectors for in-browser semantic search.

Reads interim/emb_f32.npy, writes:
  dist/v1/sem/pca.bin      float32: mean[384] + components[64][384] + scales[64]
  dist/v1/sem/int8_64.bin  Int8Array[N * 64]

The browser embeds the query with the same MiniLM weights, projects it
through this PCA, and cosine-ranks against the int8 matrix. About 9.6 MB
at 150k points, fetched only when the user opts in.
"""

from __future__ import annotations

import argparse

import joblib
import numpy as np
from sklearn.decomposition import PCA

from atlas.common import DATA_VERSION, DIST_DIR, INTERIM_DIR, ensure_dirs, get_logger

log = get_logger("semantic")

SEM_PCA_PATH = INTERIM_DIR / "sem_pca.joblib"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()
    ensure_dirs()
    out_dir = DIST_DIR / DATA_VERSION / "sem"
    out_dir.mkdir(parents=True, exist_ok=True)

    emb = np.load(INTERIM_DIR / "emb_f32.npy")
    if args.limit:
        emb = emb[: args.limit]

    if SEM_PCA_PATH.exists():
        pca = joblib.load(SEM_PCA_PATH)  # frozen with the map
        proj = pca.transform(emb)
    else:
        pca = PCA(n_components=64, random_state=42)
        proj = pca.fit_transform(emb)
        joblib.dump(pca, SEM_PCA_PATH)

    # Per-dimension symmetric int8 quantization.
    scales = (np.abs(proj).max(axis=0) / 127.0).astype(np.float32)
    scales[scales == 0] = 1.0
    q = np.clip(np.round(proj / scales), -127, 127).astype(np.int8)

    with open(out_dir / "pca.bin", "wb") as f:
        f.write(pca.mean_.astype(np.float32).tobytes())
        f.write(pca.components_.astype(np.float32).tobytes())
        f.write(scales.tobytes())
    with open(out_dir / "int8_64.bin", "wb") as f:
        f.write(q.tobytes())

    log.info("wrote sem/pca.bin (%.0f KB) and sem/int8_64.bin (%.1f MB)",
             (out_dir / "pca.bin").stat().st_size / 1024,
             (out_dir / "int8_64.bin").stat().st_size / 1e6)


if __name__ == "__main__":
    main()
