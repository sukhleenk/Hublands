"""Stage 3: embed documents with all-MiniLM-L6-v2.

Reads interim/docs.parquet, writes interim/emb_f32.npy [N, 384], normalized.

The model choice is frozen: the browser runs the exact same weights via
Xenova/all-MiniLM-L6-v2 in transformers.js, so query vectors and corpus
vectors live in the same space. Never change it without a version bump.
"""

from __future__ import annotations

import argparse

import numpy as np
import pandas as pd

from atlas.common import EMBEDDING_MODEL, INTERIM_DIR, ensure_dirs, get_logger

log = get_logger("embed")


def pick_device() -> str:
    import torch

    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--batch-size", type=int, default=256)
    args = ap.parse_args()
    ensure_dirs()

    from sentence_transformers import SentenceTransformer

    df = pd.read_parquet(INTERIM_DIR / "docs.parquet")
    if args.limit:
        df = df.head(args.limit)
    docs = df["doc"].tolist()

    device = pick_device()
    log.info("embedding %d docs on %s", len(docs), device)
    model = SentenceTransformer(EMBEDDING_MODEL, device=device)
    emb = model.encode(
        docs,
        batch_size=args.batch_size,
        normalize_embeddings=True,
        show_progress_bar=True,
    ).astype(np.float32)

    out = INTERIM_DIR / "emb_f32.npy"
    np.save(out, emb)
    log.info("wrote %s %s", out, emb.shape)


if __name__ == "__main__":
    main()
