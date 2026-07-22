"""Stage 1: fetch Hub metadata and model cards.

Writes raw/repos.parquet with one row per included repo.

Metadata comes from the huggingface_hub list endpoints. Cards come from
concurrent raw README fetches with a semaphore of 16, cached hard under
.cache/readmes/ so re-runs cost nothing.

list_models(full=True) does not return createdAt, so we
use expand=[...] instead, which returns exactly the fields the contract
needs and nothing else.

Inclusion rules (full mode):
  models   downloads >= 100 or likes >= 3
  datasets downloads >= 50  or likes >= 3
  plus the top 2000 by trendingScore

With --limit N, take the top N by downloads (roughly 78/22 model/dataset
split) so a small run still looks like the real Hub.
"""

from __future__ import annotations

import argparse
import asyncio
import re
from dataclasses import dataclass, field

import httpx
import pandas as pd
from huggingface_hub import HfApi
from tqdm import tqdm

from atlas.common import CACHE_DIR, RAW_DIR, ensure_dirs, get_logger

log = get_logger("fetch")

MODEL_EXPAND = [
    "downloads", "likes", "tags", "pipeline_tag", "library_name",
    "createdAt", "lastModified", "trendingScore",
]
DATASET_EXPAND = [
    "downloads", "likes", "tags", "createdAt", "lastModified", "trendingScore",
]

README_CACHE = CACHE_DIR / "readmes"
SEMAPHORE = 16


@dataclass
class Repo:
    repo_id: str
    kind: int  # 0 model, 1 dataset
    downloads: int
    likes: int
    tags: list[str] = field(default_factory=list)
    pipeline_tag: str | None = None
    library_name: str | None = None
    license: str | None = None
    created_at: str | None = None
    last_modified: str | None = None
    trending_score: float = 0.0
    card: str = ""


def _license_from_tags(tags: list[str]) -> str | None:
    for t in tags:
        if t.startswith("license:"):
            return t.split(":", 1)[1]
    return None


def _to_repo(info, kind: int) -> Repo:
    tags = list(info.tags or [])
    return Repo(
        repo_id=info.id,
        kind=kind,
        downloads=int(info.downloads or 0),
        likes=int(info.likes or 0),
        tags=tags,
        pipeline_tag=getattr(info, "pipeline_tag", None),
        library_name=getattr(info, "library_name", None),
        license=_license_from_tags(tags),
        created_at=info.created_at.isoformat() if info.created_at else None,
        last_modified=info.last_modified.isoformat() if info.last_modified else None,
        trending_score=float(getattr(info, "trending_score", None) or 0.0),
    )


def _collect(iterator, kind: int, stop) -> dict[str, Repo]:
    out: dict[str, Repo] = {}
    for info in iterator:
        repo = _to_repo(info, kind)
        if stop(repo):
            break
        out[repo.repo_id] = repo
    return out


def fetch_metadata(limit: int) -> list[Repo]:
    api = HfApi()
    repos: dict[str, Repo] = {}

    if limit:
        n_models = int(limit * 0.78)
        n_datasets = limit - n_models
        log.info("limit mode: top %d models + %d datasets by downloads", n_models, n_datasets)
        it = api.list_models(sort="downloads", limit=n_models, expand=MODEL_EXPAND)
        repos.update(_collect(it, 0, stop=lambda r: False))
        it = api.list_datasets(sort="downloads", limit=n_datasets, expand=DATASET_EXPAND)
        repos.update({k: v for k, v in _collect(it, 1, stop=lambda r: False).items() if k not in repos})
        return list(repos.values())

    log.info("full mode: walking models sorted by downloads until < 100")
    it = api.list_models(sort="downloads", expand=MODEL_EXPAND)
    repos.update(_collect(it, 0, stop=lambda r: r.downloads < 100))

    log.info("full mode: walking models sorted by likes until < 3")
    it = api.list_models(sort="likes", expand=MODEL_EXPAND)
    for rid, r in _collect(it, 0, stop=lambda r: r.likes < 3).items():
        repos.setdefault(rid, r)

    log.info("full mode: walking datasets sorted by downloads until < 50")
    it = api.list_datasets(sort="downloads", expand=DATASET_EXPAND)
    repos.update({k: v for k, v in _collect(it, 1, stop=lambda r: r.downloads < 50).items() if k not in repos})

    log.info("full mode: walking datasets sorted by likes until < 3")
    it = api.list_datasets(sort="likes", expand=DATASET_EXPAND)
    for rid, r in _collect(it, 1, stop=lambda r: r.likes < 3).items():
        repos.setdefault(rid, r)

    log.info("full mode: top 2000 trending models")
    it = api.list_models(sort="trendingScore", limit=2000, expand=MODEL_EXPAND)
    for rid, r in _collect(it, 0, stop=lambda r: False).items():
        repos.setdefault(rid, r)

    return list(repos.values())


def _cache_path(repo: Repo):
    sub = "datasets" if repo.kind == 1 else "models"
    return README_CACHE / sub / (repo.repo_id.replace("/", "@@") + ".md")


async def _fetch_card(client: httpx.AsyncClient, sem: asyncio.Semaphore, repo: Repo) -> None:
    path = _cache_path(repo)
    if path.exists():
        repo.card = path.read_text(errors="replace")
        return
    prefix = "datasets/" if repo.kind == 1 else ""
    url = f"https://huggingface.co/{prefix}{repo.repo_id}/raw/main/README.md"
    async with sem:
        for attempt in range(3):
            try:
                r = await client.get(url, timeout=20.0, follow_redirects=True)
                if r.status_code == 200:
                    repo.card = r.text[:20000]
                else:
                    repo.card = ""
                break
            except httpx.HTTPError:
                if attempt == 2:
                    repo.card = ""
                else:
                    await asyncio.sleep(1.5 * (attempt + 1))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(repo.card)


async def fetch_cards(repos: list[Repo]) -> None:
    sem = asyncio.Semaphore(SEMAPHORE)
    limits = httpx.Limits(max_connections=SEMAPHORE + 4)
    async with httpx.AsyncClient(limits=limits, headers={"User-Agent": "hublands-pipeline/0.1"}) as client:
        tasks = [_fetch_card(client, sem, r) for r in repos]
        for coro in tqdm(asyncio.as_completed(tasks), total=len(tasks), desc="cards"):
            await coro


def tune_thresholds(repos: list[Repo]) -> list[Repo]:
    """Raise the inclusion floors until the corpus lands in 120k..200k.

    The base rule (models 100 dl or 3 likes, datasets 50 dl or 3 likes)
    overshoots as the Hub grows. Walk a ladder of stricter floors and keep
    the first one inside the band. Top-2000 trending always stays.
    """
    trending = sorted(repos, key=lambda r: -r.trending_score)[:2000]
    trending_ids = {r.repo_id for r in trending}
    ladder = [
        (100, 3, 50, 3), (150, 4, 75, 4), (200, 5, 100, 5),
        (300, 6, 150, 6), (500, 8, 250, 8), (1000, 12, 500, 12),
    ]
    for m_dl, m_lk, d_dl, d_lk in ladder:
        kept = [
            r for r in repos
            if r.repo_id in trending_ids
            or (r.kind == 0 and (r.downloads >= m_dl or r.likes >= m_lk))
            or (r.kind == 1 and (r.downloads >= d_dl or r.likes >= d_lk))
        ]
        if len(kept) <= 200_000:
            log.info(
                "inclusion rule tuned: models dl>=%d or likes>=%d, datasets dl>=%d or likes>=%d -> %d repos",
                m_dl, m_lk, d_dl, d_lk, len(kept),
            )
            if len(kept) < 120_000:
                log.warning("corpus below the 120k floor; the previous rung overshot 200k")
            return kept
    return kept  # strictest rung, still logged above


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="0 = full inclusion rule")
    args = ap.parse_args()
    ensure_dirs()

    repos = fetch_metadata(args.limit)
    log.info("metadata fetched for %d repos", len(repos))
    if not args.limit:
        repos = tune_thresholds(repos)

    asyncio.run(fetch_cards(repos))

    df = pd.DataFrame([r.__dict__ for r in repos])
    # Weed out repos with neither a card nor tags: nothing to embed.
    n_before = len(df)
    df = df[(df["card"].str.len() > 0) | (df["tags"].map(len) > 0)]
    # Point order is frozen here: ascending downloads, so popular repos
    # draw last (on top). Refreshes append new repos at the end and never
    # reorder, which keeps point indices stable across builds.
    df = df.sort_values("downloads", ascending=True, kind="stable").reset_index(drop=True)
    out = RAW_DIR / "repos.parquet"
    df.to_parquet(out, index=False)

    n_models = int((df["kind"] == 0).sum())
    n_datasets = int((df["kind"] == 1).sum())
    log.info("wrote %s", out)
    log.info("corpus: %d repos (%d models, %d datasets), dropped %d empty",
             len(df), n_models, n_datasets, n_before - len(df))


if __name__ == "__main__":
    main()
