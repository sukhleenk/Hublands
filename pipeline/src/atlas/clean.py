"""Stage 2: normalize cards into one embeddable document per repo.

Reads raw/repos.parquet, writes interim/docs.parquet with columns
doc (embedding input) and summary (first ~400 chars, PII-stripped, shipped
in the details shards).

Doc shape:
    {repo_id}
    {pipeline_tag} {library_name} {license}
    {tags joined by spaces}
    {first 1500 chars of stripped README}

Half of all model cards are an auto-generated template. Strip hard, or
every autotrain model lands in the same spot on the map.
"""

from __future__ import annotations

import argparse
import re

import pandas as pd

from atlas.common import INTERIM_DIR, RAW_DIR, ensure_dirs, get_logger

log = get_logger("clean")

FRONTMATTER = re.compile(r"\A---\n.*?\n---\n?", re.DOTALL)
HTML_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)
CODE_FENCE = re.compile(r"```.*?```", re.DOTALL)
INLINE_CODE = re.compile(r"`[^`\n]*`")
MD_IMAGE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
MD_LINK = re.compile(r"\[([^\]]*)\]\([^)]*\)")
HTML_TAG = re.compile(r"<[^>\n]{1,200}>")
HTML_ENTITY = re.compile(r"&[a-zA-Z#0-9]{2,8};")
BARE_URL = re.compile(r"https?://\S+")
EMAIL = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b")
HEADING_MARKUP = re.compile(r"^#{1,6}\s*", re.MULTILINE)
TABLE_ROW = re.compile(r"^\|.*\|\s*$", re.MULTILINE)
MULTI_WS = re.compile(r"[ \t]+")
MULTI_NL = re.compile(r"\n{2,}")

# Lines that are pure card-template noise. Matched case-insensitively
# against whole stripped lines.
BOILERPLATE_LINES = re.compile(
    r"^(\[?more information needed\]?\.?"
    r"|model card for .{0,40}"
    r"|this model card has been (automatically )?generated.*"
    r"|this modelcard aims to be a base template.*"
    r"|provide a longer summary of what this model is\.?"
    r"|this is the model card of a .* model that has been pushed on the hub.*"
    r"|## .{0,40}\[optional\].*"
    r")$",
    re.IGNORECASE,
)


def strip_card(card: str) -> str:
    if not card:
        return ""
    t = FRONTMATTER.sub("", card)
    t = HTML_COMMENT.sub(" ", t)
    t = CODE_FENCE.sub(" ", t)
    t = INLINE_CODE.sub(" ", t)
    t = MD_IMAGE.sub(" ", t)
    t = MD_LINK.sub(r"\1", t)
    t = HTML_TAG.sub(" ", t)
    t = HTML_ENTITY.sub(" ", t)
    t = TABLE_ROW.sub(" ", t)
    t = HEADING_MARKUP.sub("", t)
    lines = [ln.strip() for ln in t.splitlines()]
    lines = [ln for ln in lines if ln and not BOILERPLATE_LINES.match(ln)]
    t = "\n".join(lines)
    t = MULTI_WS.sub(" ", t)
    t = MULTI_NL.sub("\n", t)
    return t.strip()


def make_summary(stripped: str) -> str:
    s = BARE_URL.sub("", stripped)
    s = EMAIL.sub("", s)
    s = s.replace("\n", " ")
    s = MULTI_WS.sub(" ", s).strip()
    if len(s) > 400:
        s = s[:400].rsplit(" ", 1)[0] + "…"
    return s


def make_doc(row) -> str:
    stripped = row["stripped"][:1500]
    # isinstance guard: pandas NaN is truthy and str(NaN) puts the literal
    # token "nan" into every affected doc, which then dominates c-TF-IDF.
    meta = " ".join(
        v for v in (row["pipeline_tag"], row["library_name"], row["license"])
        if isinstance(v, str) and v
    )
    tags = " ".join(t for t in row["tags"] if not t.startswith(("license:", "region:", "arxiv:", "base_model:")))
    return f"{row['repo_id']}\n{meta}\n{tags}\n{stripped}".strip()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()
    ensure_dirs()

    df = pd.read_parquet(RAW_DIR / "repos.parquet")
    if args.limit:
        df = df.head(args.limit)

    df["stripped"] = df["card"].map(strip_card)
    df["summary"] = df["stripped"].map(make_summary)
    df["doc"] = df.apply(make_doc, axis=1)
    df = df.drop(columns=["card", "stripped"])

    out = INTERIM_DIR / "docs.parquet"
    df.to_parquet(out, index=False)
    log.info("wrote %s: %d docs, median doc length %d chars",
             out, len(df), int(df["doc"].str.len().median()))


if __name__ == "__main__":
    main()
