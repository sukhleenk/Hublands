#!/usr/bin/env bash
# Full corpus build. 
set -euo pipefail
cd "$(dirname "$0")"

WEB_DATA="../web/public/data"

echo "==> restoring full corpus (169578 rows) as active inputs"
cp raw/repos_full.parquet raw/repos.parquet
cp interim/docs_full.parquet interim/docs.parquet
uv run python -c "import pandas as pd; a=len(pd.read_parquet('raw/repos.parquet')); b=len(pd.read_parquet('interim/docs.parquet')); assert a==b, (a,b); print('active rows:', a)"

echo "==> embed (heavy: all 169k through MiniLM on MPS)"
uv run python -m atlas.embed

echo "==> project (fits and freezes UMAP for v1)"
uv run python -m atlas.project

echo "==> cluster (HDBSCAN at 3 granularities)"
uv run python -m atlas.cluster

echo "==> label (c-TF-IDF names; curate labels/labels.json afterward)"
uv run python -m atlas.label

echo "==> raster (terrain + contours)"
uv run python -m atlas.raster

echo "==> semantic (PCA64 + int8 vectors)"
uv run python -m atlas.semantic

echo "==> pack (binary artifacts + manifest)"
uv run python -m atlas.pack

echo "==> publish to web/public/data/v1"
rm -rf "$WEB_DATA/v1_fresh"
cp -r dist/v1 "$WEB_DATA/v1_fresh"
rm -rf "$WEB_DATA/v1"
mv "$WEB_DATA/v1_fresh" "$WEB_DATA/v1"

echo "==> done. reload http://localhost:3000/map"
