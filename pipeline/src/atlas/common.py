"""Shared paths and helpers for every pipeline stage.

Every stage reads from disk, writes to disk, and is independently
re-runnable. All paths are anchored to the pipeline/ directory so stages
can be invoked from anywhere.
"""

from __future__ import annotations

import logging
from pathlib import Path

PIPELINE_DIR = Path(__file__).resolve().parents[2]
CACHE_DIR = PIPELINE_DIR / ".cache"
RAW_DIR = PIPELINE_DIR / "raw"
INTERIM_DIR = PIPELINE_DIR / "interim"
DIST_DIR = PIPELINE_DIR / "dist"
LABELS_DIR = PIPELINE_DIR.parent / "labels"

EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
DATA_VERSION = "v1"

# Weeks since this epoch fill the created_week and updated_week attrs.
WEEK_EPOCH = "2018-01-01"


def ensure_dirs() -> None:
    for d in (CACHE_DIR, RAW_DIR, INTERIM_DIR, DIST_DIR, LABELS_DIR):
        d.mkdir(parents=True, exist_ok=True)


def get_logger(name: str) -> logging.Logger:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(name)s %(levelname)s %(message)s",
        datefmt="%H:%M:%S",
    )
    return logging.getLogger(name)
