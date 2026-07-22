"""Stage 6: name every cluster.

c-TF-IDF over member documents gives the top terms per cluster; an
optional one-time Claude pass (--polish, needs ANTHROPIC_API_KEY) turns
term lists into clean 2 to 4 word place names.

labels/labels.json is checked in and hand-edited. Refreshes reuse
existing names by cluster id and only name new clusters.
"""

from __future__ import annotations

import argparse
import json
import re

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import CountVectorizer

from atlas.common import INTERIM_DIR, LABELS_DIR, ensure_dirs, get_logger

log = get_logger("label")

# Terms that score high everywhere on the Hub and mean nothing.
JUNK = {
    "model", "models", "dataset", "datasets", "data", "training", "trained",
    "based", "using", "use", "used", "hub", "huggingface", "hugging", "face",
    "card", "license", "type", "results", "base", "version", "new", "task",
    "en", "https", "http", "com", "www", "io", "github", "main", "readme",
    "information", "needed", "details", "description", "example", "examples",
    "nan", "none", "null", "et", "al", "like", "different", "available",
    "nbsp", "amp", "quot", "gt", "lt",
    # metadata boilerplate that leaks out of card YAML and tag lists
    "value", "values", "number", "size", "sizes", "categories", "category",
    "modality", "modalities", "library", "libraries", "mlcroissant",
    "croissant", "endpoints", "compatible", "revision", "cutoff", "date",
    "papers", "arxiv", "region", "inference", "text",
}


def ctfidf_terms(docs_by_cluster: dict[int, str], top_k: int = 10) -> dict[int, list[str]]:
    ids = sorted(docs_by_cluster)
    corpus = [docs_by_cluster[i] for i in ids]
    vec = CountVectorizer(
        stop_words="english", max_features=40_000, ngram_range=(1, 2),
        token_pattern=r"(?u)\b[a-zA-Z][a-zA-Z0-9_.-]{1,30}\b",
    )
    tf = vec.fit_transform(corpus).astype(np.float64)
    terms = vec.get_feature_names_out()

    # BERTopic-style class TF-IDF: normalize tf per class, weight by
    # log(1 + average count / document frequency).
    tf_norm = tf.multiply(1.0 / (tf.sum(axis=1) + 1e-9))
    df = np.asarray((tf > 0).sum(axis=0)).ravel()
    idf = np.log(1.0 + (len(ids) / (df + 1e-9)))
    scores = tf_norm.multiply(idf).tocsr()

    out: dict[int, list[str]] = {}
    for row, cid in enumerate(ids):
        r = scores.getrow(row).toarray().ravel()
        order = np.argsort(r)[::-1]
        picked: list[str] = []
        for j in order:
            if r[j] <= 0 or len(picked) >= top_k:
                break
            term = terms[j]
            parts = re.split(r"[\s_]+", term)
            if any(p in JUNK for p in parts):
                continue
            if any(term in p or p in term for p in picked):
                continue
            picked.append(term)
        out[cid] = picked
    return out


def _stem(w: str) -> str:
    w = w.lower()
    if w.endswith("ies"):
        return w[:-3] + "y"
    if w.endswith("s") and not w.endswith("ss"):
        return w[:-1]
    return w


def terms_to_name(terms: list[str]) -> str:
    if not terms:
        return "Uncharted"
    words: list[str] = []
    for t in terms:
        for w in t.split():
            # skip singular/plural repeats ("entity entities")
            if any(_stem(w) == _stem(v) for v in words):
                continue
            words.append(w)
        if len(words) >= 3:
            break
    name = " ".join(words[:3])
    name = re.sub(r"[_]+", " ", name).strip()
    return name[:1].upper() + name[1:]


def dedupe_names(level_out: dict[str, dict]) -> None:
    """Two regions cannot share a name. Extend later collisions with the
    first of their own terms that tells them apart."""
    seen: set[str] = set()
    for key, entry in level_out.items():
        if key == "0":
            continue
        name = entry["label"]
        if name.lower() in seen:
            extra = next(
                (
                    w
                    for t in entry.get("terms", [])
                    for w in t.split()
                    if w.lower() not in name.lower()
                ),
                key,
            )
            name = f"{name} {extra}"
            entry["label"] = name
        seen.add(name.lower())


def polish_names(payload: dict[str, dict[str, list[str]]]) -> dict[str, dict[str, str]] | None:
    """One-time Claude pass, roughly $2 for a full corpus. Batches of 20."""
    try:
        import anthropic
    except ImportError:
        log.warning("anthropic not installed, skipping polish")
        return None
    client = anthropic.Anthropic()
    out: dict[str, dict[str, str]] = {lvl: {} for lvl in payload}
    for lvl, clusters in payload.items():
        items = list(clusters.items())
        for i in range(0, len(items), 20):
            batch = items[i : i + 20]
            prompt = (
                "Each line is a cluster of Hugging Face repos with its top c-TF-IDF terms. "
                "Reply with one line per cluster: `id: name` where name is a clean 2 to 4 word "
                "place-style label like 'Speech recognition' or 'Quantized 7B chat models'. "
                "Sentence case. No punctuation beyond the colon.\n\n"
                + "\n".join(f"{cid}: {', '.join(t)}" for cid, t in batch)
            )
            msg = client.messages.create(
                model="claude-sonnet-4-6", max_tokens=1500,
                messages=[{"role": "user", "content": prompt}],
            )
            for line in msg.content[0].text.strip().splitlines():
                if ":" in line:
                    cid, name = line.split(":", 1)
                    out[lvl][cid.strip()] = name.strip()
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--polish", action="store_true", help="one-time Claude naming pass")
    args = ap.parse_args()
    ensure_dirs()

    docs = pd.read_parquet(INTERIM_DIR / "docs.parquet")["doc"]
    clusters = np.load(INTERIM_DIR / "clusters.npy")
    if args.limit:
        docs, clusters = docs.head(args.limit), clusters[: args.limit]

    labels_path = LABELS_DIR / "labels.json"
    existing = json.loads(labels_path.read_text()) if labels_path.exists() else {}

    result: dict[str, dict[str, dict]] = {}
    terms_payload: dict[str, dict[str, list[str]]] = {}
    for i, lvl in enumerate(("l1", "l2", "l3")):
        col = clusters[:, i]
        grouped = {
            int(cid): " ".join(docs[col == cid].sample(min(400, int((col == cid).sum())), random_state=42))
            for cid in np.unique(col) if cid != 0
        }
        terms = ctfidf_terms(grouped)
        terms_payload[lvl] = {str(cid): t for cid, t in terms.items()}
        level_out = {}
        prior = existing.get(lvl, {})
        for cid, t in terms.items():
            key = str(cid)
            if key in prior:  # curated names survive rebuilds
                level_out[key] = prior[key]
            else:
                level_out[key] = {"label": terms_to_name(t), "terms": t}
        dedupe_names(level_out)
        level_out["0"] = {"label": "Unmapped", "terms": []}
        result[lvl] = level_out
        log.info("%s: %d labels", lvl, len(level_out) - 1)

    if args.polish:
        polished = polish_names(terms_payload)
        if polished:
            for lvl, names in polished.items():
                for cid, name in names.items():
                    if cid in result[lvl]:
                        result[lvl][cid]["label"] = name

    labels_path.write_text(json.dumps(result, indent=1, ensure_ascii=False))
    log.info("wrote %s (commit this file)", labels_path)
    for lvl in ("l1",):
        sample = [v["label"] for k, v in result[lvl].items() if k != "0"][:20]
        log.info("%s names: %s", lvl, "; ".join(sample))


if __name__ == "__main__":
    main()
