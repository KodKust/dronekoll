#!/usr/bin/env python3
"""Statiska Voyager-kartor för icke-overlay-länder (fas 3, ENGÅNGS + on-demand).

Hämtar Carto Voyager-raster-tiles (appens egen ljusa baskarta,
map_screen.dart:941) för varje icke-overlay-lands bbox, syr ihop, beskär,
bränner in attribution och sparar WebP → public/static-maps/{iso}.webp.
Committas som byggartefakter — INGEN tile-hämtning i CI-bygget (artigt mot
tile-servern; ~600 tiles totalt, engångs).

    python3 scripts/render_static_maps.py            # alla som saknas
    python3 scripts/render_static_maps.py --force    # rendera om alla
    python3 scripts/render_static_maps.py SE NO      # specifika
Kräver: pip install requests pillow
"""
from __future__ import annotations

import json
import math
import sys
import time
from io import BytesIO
from pathlib import Path

import requests
from PIL import Image, ImageDraw

SITE_ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = SITE_ROOT / "public" / "static-maps"
TILE_URL = "https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png"
ATTRIBUTION = "© OpenStreetMap contributors © CARTO"
TARGET_W, TARGET_H = 1200, 900  # 4:3, matchar kartramen
TILE = 512  # @2x-tiles


def lonlat_to_pixels(lon: float, lat: float, z: int) -> tuple[float, float]:
    scale = TILE * (2 ** z)
    x = (lon + 180.0) / 360.0 * scale
    lat_r = math.radians(max(-85.05, min(85.05, lat)))
    y = (1 - math.log(math.tan(lat_r) + 1 / math.cos(lat_r)) / math.pi) / 2 * scale
    return x, y


def pick_zoom(lat_min, lat_max, lon_min, lon_max) -> int:
    for z in range(11, 2, -1):
        x0, y1 = lonlat_to_pixels(lon_min, lat_min, z)
        x1, y0 = lonlat_to_pixels(lon_max, lat_max, z)
        if (x1 - x0) <= TARGET_W * 0.92 and (y1 - y0) <= TARGET_H * 0.92:
            return z
    return 3


def render(iso: str, bbox: tuple[float, float, float, float], session: requests.Session) -> Image.Image:
    lat_min, lat_max, lon_min, lon_max = bbox
    z = pick_zoom(lat_min, lat_max, lon_min, lon_max)

    cx = (lonlat_to_pixels(lon_min, 0, z)[0] + lonlat_to_pixels(lon_max, 0, z)[0]) / 2
    cy = (lonlat_to_pixels(0, lat_min, z)[1] + lonlat_to_pixels(0, lat_max, z)[1]) / 2
    px0, py0 = cx - TARGET_W / 2, cy - TARGET_H / 2

    tx0, ty0 = int(px0 // TILE), int(py0 // TILE)
    tx1, ty1 = int((px0 + TARGET_W) // TILE), int((py0 + TARGET_H) // TILE)

    canvas = Image.new("RGB", ((tx1 - tx0 + 1) * TILE, (ty1 - ty0 + 1) * TILE), "#EDEFF3")
    n_tiles = 0
    max_tile = 2 ** z - 1
    for tx in range(tx0, tx1 + 1):
        for ty in range(ty0, ty1 + 1):
            if ty < 0 or ty > max_tile:
                continue
            wrapped_tx = tx % (2 ** z)
            resp = session.get(TILE_URL.format(z=z, x=wrapped_tx, y=ty), timeout=30)
            resp.raise_for_status()
            canvas.paste(Image.open(BytesIO(resp.content)).convert("RGB"),
                         ((tx - tx0) * TILE, (ty - ty0) * TILE))
            n_tiles += 1
            time.sleep(0.1)  # artighet

    crop_x, crop_y = int(px0 - tx0 * TILE), int(py0 - ty0 * TILE)
    img = canvas.crop((crop_x, crop_y, crop_x + TARGET_W, crop_y + TARGET_H))

    # Attribution (krav) — diskret platta nere till höger
    draw = ImageDraw.Draw(img, "RGBA")
    text = ATTRIBUTION
    tw = draw.textlength(text)
    pad = 8
    draw.rectangle(
        (TARGET_W - tw - pad * 3, TARGET_H - 26, TARGET_W, TARGET_H),
        fill=(255, 255, 255, 200),
    )
    draw.text((TARGET_W - tw - pad * 1.5, TARGET_H - 20), text, fill=(70, 76, 86, 255))

    print(f"  z{z}, {n_tiles} tiles")
    return img


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    force = "--force" in sys.argv

    countries_path = None
    for rel in ("data/live/countries.json", "data/snapshots/countries.json"):
        if (SITE_ROOT / rel).exists():
            countries_path = SITE_ROOT / rel
            break
    if not countries_path:
        raise SystemExit("countries.json saknas — kör npm run fetch-data")

    data = json.loads(countries_path.read_text())
    # ALLA länder — icke-overlay använder bilden som huvudkarta, overlay-länder
    # som fallback när interaktiva lager saknas (SE/ES tills fetchers i drift).
    targets = [c for c in data["countries"] if c["isoCode"] != "OTHER"]
    if args:
        wanted = {a.upper() for a in args}
        targets = [c for c in targets if c["isoCode"].upper() in wanted]

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    session.headers["User-Agent"] = "dronekoll.com static-map generator (one-time)"

    done = skipped = 0
    for c in targets:
        iso = c["isoCode"].upper()
        out = OUT_DIR / f"{iso.lower()}.webp"
        if out.exists() and not force:
            skipped += 1
            continue
        print(f"{iso} …", flush=True)
        img = render(iso, (c["latMin"], c["latMax"], c["lonMin"], c["lonMax"]), session)
        img.save(out, "WEBP", quality=80)
        print(f"  ✓ {out.name} ({out.stat().st_size // 1024} kB)")
        done += 1

    print(f"\nKlart: {done} renderade, {skipped} fanns redan.")


if __name__ == "__main__":
    main()
