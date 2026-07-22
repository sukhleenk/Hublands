"""Stage 7: density terrain and contours.

Reads interim/xy.npy plus downloads, writes:
  dist/v1/terrain.webp        dark bathymetric ground, 2048 x 2048
  dist/v1/terrain_light.webp  light chart variant
  dist/v1/contours.json.gz    8 isolines as GeoJSON MultiLineStrings

Density is a downloads-weighted 2D histogram smoothed with a Gaussian
(a gridded KDE).
"""

from __future__ import annotations

import argparse
import gzip
import json

import numpy as np
import pandas as pd
from PIL import Image
from scipy.ndimage import gaussian_filter
from skimage import measure

from atlas.common import DATA_VERSION, DIST_DIR, INTERIM_DIR, RAW_DIR, ensure_dirs, get_logger

log = get_logger("raster")

GRID = 2048
SIGMA = 9.0
BOUND = 1.0
N_CONTOURS = 8

# Dark ramp: abyss through teal to near-white, so dense areas read
# brighter.
DARK_RAMP = [
    (0.00, "071013"),  # matches the page background
    (0.08, "0C2630"),
    (0.25, "15595E"),
    (0.45, "2A8578"),
    (0.65, "6FC49B"),
    (0.85, "C4ECC0"),
    (1.00, "FBFFE8"),
]
COAST = 0.30
STORYBOOK_RAMP = [
    (0.00, "F3ECDA"),  # matches the page background
    (0.28, "EDE2C6"),
    (0.30, "E8DBB8"),  # coastline sits here
    (0.55, "E0CFA1"),
    (0.80, "D5BF85"),
    (1.00, "C8AC66"),
]


def hex_to_rgb(h: str) -> np.ndarray:
    return np.array([int(h[i : i + 2], 16) for i in (0, 2, 4)], dtype=np.float64)


def apply_ramp(v: np.ndarray, ramp) -> np.ndarray:
    stops = np.array([s for s, _ in ramp])
    colors = np.stack([hex_to_rgb(c) for _, c in ramp])
    out = np.zeros((*v.shape, 3), dtype=np.float64)
    for ch in range(3):
        out[..., ch] = np.interp(v, stops, colors[:, ch])
    return out.astype(np.uint8)


def decorate_storybook(rgb: np.ndarray, v: np.ndarray) -> np.ndarray:
    """Coastline ink and a faded sheet edge for the light theme."""
    out = rgb.astype(np.float64)
    ink = hex_to_rgb("3D3423")

    # faint coastline where density crosses the coast threshold
    land = v >= COAST
    from scipy.ndimage import binary_dilation
    edge = binary_dilation(land, iterations=2) & ~binary_dilation(~land, iterations=1)
    edge = edge & ~land
    out[edge] = out[edge] * 0.75 + ink * 0.25

    # deckled sheet edge: fade the sea into the paper margin
    h, w, _ = out.shape
    yy, xx = np.mgrid[0:h, 0:w]
    paper = hex_to_rgb("F3ECDA")
    m = 90.0
    dist = np.minimum.reduce([
        yy, xx, (h - 1) - yy, (w - 1) - xx,
    ]).astype(np.float64)
    t = np.clip(dist / m, 0.0, 1.0)[..., None]
    t = t * t * (3 - 2 * t)  # smoothstep
    out = out * t + paper * (1 - t)
    return np.clip(out, 0, 255).astype(np.uint8)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()
    ensure_dirs()
    out_dir = DIST_DIR / DATA_VERSION
    out_dir.mkdir(parents=True, exist_ok=True)

    xy = np.load(INTERIM_DIR / "xy.npy")
    downloads = pd.read_parquet(RAW_DIR / "repos.parquet")["downloads"].to_numpy()
    if args.limit:
        xy, downloads = xy[: args.limit], downloads[: args.limit]
    w = np.log1p(downloads.astype(np.float64))

    edges = np.linspace(-BOUND, BOUND, GRID + 1)

    # Blend a count field with a downloads-weighted field. Weighting alone
    # is near-black outside a few huge-download peaks.
    def field(weights) -> np.ndarray:
        hist, _, _ = np.histogram2d(xy[:, 1], xy[:, 0], bins=[edges, edges], weights=weights)
        dens = np.log1p(gaussian_filter(hist, sigma=SIGMA))
        hi = np.percentile(dens[dens > 0], 99.7) if (dens > 0).any() else 1.0
        return np.clip(dens / hi, 0.0, 1.0)

    v_count = field(np.ones_like(w))
    v_heat = field(w + 1.0)
    v = np.clip(0.55 * v_count**0.6 + 0.55 * v_heat, 0.0, 1.0)

    for name, ramp in (("terrain.webp", DARK_RAMP), ("terrain_light.webp", STORYBOOK_RAMP)):
        rgb = apply_ramp(v, ramp)
        if ramp is STORYBOOK_RAMP:
            rgb = decorate_storybook(rgb, v)
        img = Image.fromarray(rgb[::-1])  # row 0 of the image is maxY
        img.save(out_dir / name, format="WEBP", quality=92)
        kb = (out_dir / name).stat().st_size / 1024
        log.info("wrote %s (%.0f KB)", name, kb)
        if kb > 1024:
            log.warning("%s exceeds the 1 MB budget", name)

    # coast level first, then elevation lines
    levels = np.array([0.18, COAST, 0.44, 0.58, 0.74, 0.88])
    features = []
    px_to_map = 2 * BOUND / GRID
    for li, level in enumerate(levels):
        lines = []
        for contour in measure.find_contours(v, level):
            simplified = measure.approximate_polygon(contour, tolerance=1.5)
            if len(simplified) < 4:
                continue
            coords = [
                [round(-BOUND + c * px_to_map, 4), round(-BOUND + r * px_to_map, 4)]
                for r, c in simplified
            ]
            lines.append(coords)
        features.append({
            "type": "Feature",
            "properties": {"level": li},
            "geometry": {"type": "MultiLineString", "coordinates": lines},
        })
    geo = {"type": "FeatureCollection", "features": features}
    path = out_dir / "contours.json.gz"
    with gzip.open(path, "wt") as f:
        json.dump(geo, f, separators=(",", ":"))
    log.info("wrote contours.json.gz (%.0f KB, %d levels)", path.stat().st_size / 1024, N_CONTOURS)


if __name__ == "__main__":
    main()
