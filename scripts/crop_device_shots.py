#!/usr/bin/env python3
"""Enhetsbilder till app-CTA-panelen — croppade ur befintliga butiks-PNG:er.

Källa: ~/Desktop/Drönarkartan/App Store/Råa skärmdumpar/<Land>/Klara för ASC/<locale>/01_*.png
(1290×2796-kompositer med renderad titanram + skugga på vit botten;
crop-konstanter ur generate_screenshots_final.py: telefonen ligger ~y530–2790).

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
SRC_ROOT = Path.home() / "Desktop" / "Drönarkartan" / "App Store" / "Råa skärmdumpar"

# språk → käll-landsmapp (iOS-butikens 29 locale-set)
LANG_TO_DIR = {
    "sv": "Sweden", "da": "Denmark", "no": "Norway", "fi": "Finland",
    "de": "Germany", "fr": "France", "es": "Spain", "pt": "Portugal",
    "it": "Italy", "nl": "Netherlands", "pl": "Poland", "cs": "Czech Republic",
    "sk": "Slovakia", "hu": "Hungary", "hr": "Croatia", "ro": "Romania",
    "el": "Greece", "tr": "Turkey", "uk": "Ukraina", "en": "United States",
    # is/sl/bg/lt/lv/et/mt saknar butiks-set → en-fallback (hanteras nedan)
}
FALLBACK = "en"
CROP_TOP, CROP_BOTTOM = 530, 2790  # ur generate_screenshots_final.py-geometrin
TARGET_W = 640


def find_source(country_dir: str) -> Path | None:
    base = SRC_ROOT / country_dir / "Klara för ASC"
    if not base.is_dir():
        return None
    for locale_dir in sorted(base.iterdir()):
        if not locale_dir.is_dir():
            continue
        shots = sorted(locale_dir.glob("01_*.png")) or sorted(locale_dir.glob("*.png"))
        if shots:
            return shots[0]
    return None


def autotrim_white(img: Image.Image, tol: int = 8) -> Image.Image:
    """Trimma vita marginaler (butiks-canvasen är ren vit)."""
    bg = Image.new("RGB", img.size, (255, 255, 255))
    diff = ImageChops.difference(img.convert("RGB"), bg)
    bbox = diff.point(lambda p: 255 if p > tol else 0).getbbox()
    return img.crop(bbox) if bbox else img


# Feature-sidornas bilder: slot per funktion, [overlay-källa, icke-overlay-källa].
# Icke-overlay-set = overlay-sekvensen minus zonkarte-introparet (allt −2) —
# verifierat visuellt 2026-07-09 (BR 01 = vindbilden = SE 03).
# null i pos 2 → EN-fallback för icke-overlay-språk (t.ex. kart-heron finns
# bara i overlay-set).
FEATURE_SLOTS: dict[str, tuple[str, str | None]] = {
    "flight-log": ("07", "05"),
    "measure": ("03", "01"),
    "checklists": ("08", "06"),
    "map": ("01", None),
}
# Crop-källländer med overlay-set (10 slots); övriga har 8-slots-setet.
OVERLAY_SOURCE_DIRS = {
    "Sweden", "Denmark", "Norway", "Finland", "France", "Spain", "Portugal",
    "Netherlands", "Romania", "Slovakia", "United States", "Austria CPP",
    "Ireland CPP", "Luxemburg CPP",
}


def find_slot(country_dir: str, slot: str) -> Path | None:
    base = SRC_ROOT / country_dir / "Klara för ASC"
    if not base.is_dir():
        return None
    for locale_dir in sorted(base.iterdir()):
        if not locale_dir.is_dir():
            continue
        shots = sorted(locale_dir.glob(f"{slot}_*.png"))
        if shots:
            return shots[0]
    return None


def crop_features(force: bool) -> None:
    for feature, (slot_overlay, slot_plain) in FEATURE_SLOTS.items():
        out_dir = OUT_DIR / feature
        out_dir.mkdir(parents=True, exist_ok=True)
        for lang in sorted(set(list(LANG_TO_DIR) + ["is", "sl", "bg", "lt", "lv", "et", "mt"])):
            out = out_dir / f"{lang}.webp"
            if out.exists() and not force:
                continue
            country_dir = LANG_TO_DIR.get(lang)
            src = None
            if country_dir:
                is_overlay_src = country_dir in OVERLAY_SOURCE_DIRS
                slot = slot_overlay if is_overlay_src else slot_plain
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
            print(f"✓ {feature}/{lang} ← {src.parent.parent.parent.name} slot {src.name[:2]}")


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
