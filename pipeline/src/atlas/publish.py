"""Stage 10: publish dist/ to the Hugging Face dataset repo.

Uploads dist/v1/ plus the fitted reducers (large, so they live here and
not in git) to huggingface.co/datasets/{namespace}/hublands-data.

Needs HF_TOKEN in the environment. The repo is public so the CDN serves
it with CORS to the app for free.
"""

from __future__ import annotations

import argparse
import os

from huggingface_hub import HfApi

from atlas.common import DATA_VERSION, DIST_DIR, INTERIM_DIR, get_logger

log = get_logger("publish")

REDUCERS = ["pca.joblib", "umap_reducer.joblib", "sem_pca.joblib", "norm.json"]
# Everything the weekly refresh needs to run on a stateless CI runner.
STATE = ["xy.npy", "clusters.npy", "pca50.npy", "emb_f32.npy"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=os.environ.get("HUBLANDS_DATA_REPO", ""),
                    help="e.g. someuser/hublands-data")
    args = ap.parse_args()
    if not args.repo:
        raise SystemExit("pass --repo <namespace>/hublands-data or set HUBLANDS_DATA_REPO")
    if not os.environ.get("HF_TOKEN"):
        raise SystemExit("HF_TOKEN is not set")

    api = HfApi()
    api.create_repo(args.repo, repo_type="dataset", exist_ok=True)

    log.info("uploading %s to %s", DIST_DIR / DATA_VERSION, args.repo)
    api.upload_folder(
        folder_path=str(DIST_DIR / DATA_VERSION),
        path_in_repo=DATA_VERSION,
        repo_id=args.repo,
        repo_type="dataset",
        commit_message=f"publish {DATA_VERSION} build",
    )

    for folder, names in (("reducers", REDUCERS), ("state", STATE)):
        for name in names:
            p = INTERIM_DIR / name
            if p.exists():
                api.upload_file(
                    path_or_fileobj=str(p),
                    path_in_repo=f"{folder}/{name}",
                    repo_id=args.repo,
                    repo_type="dataset",
                )
    from atlas.common import RAW_DIR
    state_parquet = RAW_DIR / "repos.parquet"
    if state_parquet.exists():
        api.upload_file(
            path_or_fileobj=str(state_parquet),
            path_in_repo="state/repos.parquet",
            repo_id=args.repo,
            repo_type="dataset",
        )
    log.info("published. data URL base: https://huggingface.co/datasets/%s/resolve/main/%s/",
             args.repo, DATA_VERSION)


if __name__ == "__main__":
    main()
