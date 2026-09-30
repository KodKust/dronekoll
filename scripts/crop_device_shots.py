#!/usr/bin/env python3
"""Enhetsbilder till app-CTA-panelen — croppade ur befintliga butiks-PNG:er.

Källa (sedan 2026-09-30, ljusa temat): ~/Desktop/Drönarkartan/App Store/Skärmdumpar 1.2.6/<Land>/NN_screenshot.png
(1290×2796-kompositer med renderad titanram + skugga på vit botten; samma
geometri som de gamla »Klara för ASC«-seten: telefonen ligger ~y530–2790).
Bildordningen skiljer sig mellan set — se FEATURE_SLOTS.

Per SPRÅK väljs bästa käll-land (svenska sidor får svenska app-UI:t osv;
språk utan butiks-set faller tillbaka på engelska). Ut: public/device/{lang}.webp
(~640w, autotrimmad). Engångs + on-demand; committas som artefakter.

    python3 scripts/crop_device_shots.py [--force]
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageChops

SITE_ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = SITE_ROOT / "public" / "device"
SRC_ROOT = Path.home() / "Desktop" / "Drönarkartan" / "App Store" / "Skärmdumpar 1.2.6"

# språk → käll-landsmapp (iOS-butikens 29 locale-set)
LANG_TO_DIR = {
    "sv": "Sweden", "da": "Denmark", "no": "Norway", "fi": "Finland",
    "de": "Germany", "fr": "France", "es": "Spain", "pt": "Portugal",
    "it": "Italy", "nl": "Netherlands", "pl": "Poland", "cs": "Czech Republic",
    "sk": "Slovakia", "hu": "Hungary", "hr": "Croatia", "ro": "Romania",
    "el": "Greece", "tr": "Turkey", "uk": "Ukraine", "en": "United States",
    "is": "Island", "sl": "Slovenia", "et": "Estonia CPP",
    # bg/lt/lv/mt saknar butiks-set → en-fallback (hanteras nedan)
}
FALLBACK = "en"
CROP_TOP, CROP_BOTTOM = 530, 2790  # ur generate_screenshots_final.py-geometrin
TARGET_W = 640


def find_source(country_dir: str) -> Path | None:
    return find_slot(country_dir, "01")


def autotrim_white(img: Image.Image, tol: int = 8) -> Image.Image:
    """Trimma vita marginaler (butiks-canvasen är ren vit)."""
    bg = Image.new("RGB", img.size, (255, 255, 255))
    diff = ImageChops.difference(img.convert("RGB"), bg)
    bbox = diff.point(lambda p: 255 if p > tol else 0).getbbox()
    return img.crop(bbox) if bbox else img


# Feature-sidornas bilder: slot per funktion, [overlay-källa, icke-overlay-källa, Tyskland].
# 1.2.6-seten (verifierat visuellt 2026-09-30 på Island/Polen/Tyskland):
#   overlay (10):  01 karta · 02 zonblad · 03 vind · 04 flyglogg · 05 checklista · 06 ND ·
#                  07 resa · 08 flygvarning · 09 trafik · 10 mät
#   NOTAM-only (8): 01 vind · 02 checklista · 03 flyglogg · 04 ND · 05 resa · 06 flygvarning ·
#                  07 trafik · 08 mät
#   Tyskland (9):  01 karta · 02 zonblad · 03 lager · 04 flugbuch · 05 checkliste · 06 ND ·
#                  07 reise · 08 messen · 09 regeln
# None → EN-fallback (kart-heron finns bara i overlay-set).
FEATURE_SLOTS: dict[str, tuple[str, str | None, str]] = {
    "flight-log": ("04", "03", "04"),
    "measure": ("10", "08", "08"),
    "checklists": ("05", "02", "05"),
    "map": ("01", None, "01"),
}
# Crop-källländer med overlay-set (10 slots); övriga har 8-slots-setet.
OVERLAY_SOURCE_DIRS = {
    "Sweden", "Denmark", "Norway", "Finland", "France", "Spain", "Portugal",
    "Netherlands", "Romania", "Slovakia", "United States", "Island", "Slovenia",
    "Estonia CPP",
}
GERMANY_DIR = "Germany"


def find_slot(country_dir: str, slot: str) -> Path | None:
    base = SRC_ROOT / country_dir
    if not base.is_dir():
        return None
    shots = sorted(base.glob(f"{slot}_*.png"))
    return shots[0] if shots else None


def crop_features(force: bool) -> None:
    for feature, (slot_overlay, slot_plain, slot_de) in FEATURE_SLOTS.items():
        out_dir = OUT_DIR / feature
        out_dir.mkdir(parents=True, exist_ok=True)
        for lang in sorted(set(list(LANG_TO_DIR) + ["is", "sl", "bg", "lt", "lv", "et", "mt"])):
            out = out_dir / f"{lang}.webp"
            if out.exists() and not force:
                continue
            country_dir = LANG_TO_DIR.get(lang)
            src = None
            if country_dir:
                if country_dir == GERMANY_DIR:
                    slot = slot_de
                else:
                    slot = slot_overlay if country_dir in OVERLAY_SOURCE_DIRS else slot_plain
                if slot:
                    src = find_slot(country_dir, slot)
            if src is None:
                en_out = out_dir / f"{FALLBACK}.webp"
                if en_out.exists():
                    out.write_bytes(en_out.read_bytes())
                    print(f"○ {feature}/{lang}: en-fallback")
                else:
                    print(f"⚠ {feature}/{lang}: väntar på en.webp — kör igen")
                continue
            img = Image.open(src).convert("RGB")
            w, h = img.size
            img = img.crop((0, min(CROP_TOP, h - 1), w, min(CROP_BOTTOM, h)))
            img = autotrim_white(img)
            ratio = TARGET_W / img.width
            img = img.resize((TARGET_W, int(img.height * ratio)), Image.LANCZOS)
            img.save(out, "WEBP", quality=82)
            print(f"✓ {feature}/{lang} ← {src.parent.name} slot {src.name[:2]}")


def main() -> None:
    force = "--force" in sys.argv
    if "--features" in sys.argv:
        crop_features(force)
        return
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    done = 0
    for lang in sorted(set(list(LANG_TO_DIR) + ["is", "sl", "bg", "lt", "lv", "et", "mt"])):
        out = OUT_DIR / f"{lang}.webp"
        if out.exists() and not force:
            continue
        country_dir = LANG_TO_DIR.get(lang)
        src = find_source(country_dir) if country_dir else None
        if src is None:
            # fallback: kopiera engelska cropen (skapas först — 'en' < övriga alfabetiskt? nej)
            en_out = OUT_DIR / f"{FALLBACK}.webp"
            if en_out.exists():
                out.write_bytes(en_out.read_bytes())
                print(f"○ {lang}: en-fallback")
                done += 1
            else:
                print(f"⚠ {lang}: ingen källa och en.webp saknas ännu — kör igen")
            continue

        img = Image.open(src).convert("RGB")
        w, h = img.size
        img = img.crop((0, min(CROP_TOP, h - 1), w, min(CROP_BOTTOM, h)))
        img = autotrim_white(img)
        ratio = TARGET_W / img.width
        img = img.resize((TARGET_W, int(img.height * ratio)), Image.LANCZOS)
        img.save(out, "WEBP", quality=82)
        print(f"✓ {lang} ← {src.parent.name}/{src.name} → {out.stat().st_size // 1024} kB")
        done += 1

    print(f"\nKlart: {done} bilder i {OUT_DIR.relative_to(SITE_ROOT)}")


if __name__ == "__main__":
    main()
