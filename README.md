# Hublands
![weekly refresh](https://github.com/sukhleenk/Hublands/actions/workflows/refresh.yml/badge.svg)
[![License: MIT](https://img.shields.io/github/license/sukhleenk/Hublands)](LICENSE)
[![HF Dataset](https://img.shields.io/badge/data-huggingface-FFD21E?logo=huggingface)](https://huggingface.co/datasets/sukhleenkaur/hublands-data)
![Vercel](https://img.shields.io/github/deployments/sukhleenk/Hublands/Production?label=vercel)

An interactive atlas of the Hugging Face Hub. Every public model and dataset is a point on the map. The position encodes what it does, density encodes how much it gets used. Built (from my own frustrations on exploring the space) so you can see the shape of the open model ecosystem at a glance, without already knowing what you're looking for.

**[Live site](https://hublands.vercel.app)**.

---

## What it shows

- Models and datasets, each placed by semantic similarity
- Denser regions = more downloads. Sparse regions = niche or emerging work
- Named clusters at three zoom levels: broad regions, neighborhoods, and specific communities
- A depth-ramp color field (think bathymetric survey chart) showing the landscape of the Hub

## Features

- **Name search**: instant substring match across all repos, no index file, works offline
- **Semantic search**: opt-in, finds repos by meaning not just name (downloads ~10 MB of model weights once)
- **Filters**: kind (model / dataset), task, library, license, downloads, and date range
- **Date slider**: scrub through time to watch the Hub grow week by week
- **Detail panel**: click any point for its tags, stats, and a link to the Hub page
- **Similar repos**: when semantic search is on, the detail panel shows nearest neighbors
- **Permalinks**: every view, filter, and selection lives in the URL. Every screenshot is a working link
- **Light and dark themes**: `?theme=chart` for a pale hydrographic variant that screenshots well
- **Accessible list view** at `/browse`: same filters, keyboard navigable, screen reader friendly

---

## Running locally

### Web app

Requires Node 20+.

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:3000`. The app fetches data from the live Hugging Face dataset repo, so you do not need to run the pipeline locally to see something.

### Pipeline

Requires Python 3.11 and [uv](https://docs.astral.sh/uv/).

```bash
cd pipeline
uv sync
```

Run a single stage against a small slice of data:

```bash
uv run python src/atlas/fetch.py --limit 5000
uv run python src/atlas/clean.py --limit 5000
uv run python src/atlas/embed.py --limit 5000
# ... and so on through project, cluster, label, raster, pack
```

Every stage reads from disk and writes to disk. You can re-run any stage in isolation. The full pipeline runs weekly on GitHub Actions; see `.github/workflows/refresh.yml`.

---

## Contributing

Issues and pull requests are welcome.

A few things to know before opening a PR:

- The data contract (binary file formats, field names, manifest schema) is stable. Changes to it affect both the pipeline and the frontend simultaneously and need to be coordinated.
- The 2D layout is intentionally frozen for now. PRs that refit the projection will not be merged.
- Cluster labels in `labels/labels.json` are a curated artifact. Edits to improve them are very welcome, that file is meant to be human-reviewed.
- Keep the dependency count low. The frontend uses Next.js, Tailwind, and deck.gl. The pipeline uses the packages in `pyproject.toml`.

For larger changes, open an issue first and we can discuss the approach!

---

Built by [Sukhleen Kaur](https://github.com/sukhleenkaur). Data from [Hugging Face](https://huggingface.co). Repo cards via [librarian-bots](https://huggingface.co/librarian-bots). MIT license. README co-authored by [Claude](https://claude.ai).
