#!/usr/bin/env python3
"""EN-overlay-generator för dronekoll.com (fas 6).

Läser countries.json (data/live/ → data/snapshots/) och skapar
src/content/en/{ISO}.json för varje icke-engelskt land: DeepL-översättning
av innehållsfälten till engelska, med sourceHash för staleness-spårning.

Speglar husets DeepL-konventioner (dronarkartan tools/deepl/batch_translate.py):
nyckel i dronarkartan/.secrets/deepl_api_key.txt (eller env DEEPL_API_KEY),
:fx-suffix → free-endpoint, 50 texter/chunk, preserve_formatting=1.

IS/HR/MT stöds EJ av DeepL (husets beslut) → stub-fil med källtexten och
"engine": "manual" — översätts för hand/Claude och committas.

Körning:
    python3 scripts/translate_en.py              # alla som saknas
    python3 scripts/translate_en.py --stale-only # bara de vars källa ändrats
    python3 scripts/translate_en.py SE NL        # specifika länder
OBS: checklist översätts INTE (renderas ej på sajten v1) — sparar ~40 % volym.
"""
from __future__ import annotations

import hashlib
import json
import sys
from datetime import date
from pathlib import Path

import requests

SITE_ROOT = Path(__file__).resolve().parent.parent
EN_DIR = SITE_ROOT / "src" / "content" / "en"
KEY_PATHS = [
    Path.home() / "Developer" / "dronarkartan" / ".secrets" / "deepl_api_key.txt",
]

# Källspråk → DeepL source_lang (targets i appens karta; source saknar varianter)
SOURCE_LANGS = {
    "sv": "SV", "no": "NB", "da": "DA", "fi": "FI", "de": "DE", "fr": "FR",
    "es": "ES", "it": "IT", "pt": "PT", "nl": "NL", "pl": "PL", "cs": "CS",
    "sk": "SK", "hu": "HU", "ro": "RO", "el": "EL", "et": "ET", "lv": "LV",
    "lt": "LT", "sl": "SL", "bg": "BG", "tr": "TR", "uk": "UK",
    # is, hr, mt — stöds ej → manuell väg
}
MANUAL_LANGS = {"is", "hr", "mt"}

# Fält som översätts (parallellt med ingest.englishContent-mergen)
STRING_FIELDS = [
    "disclaimerText", "sectionLabelRules", "sectionLabelPrimary",
    "sectionLabelSecondary", "linksSheetTitle", "dronePilotCredentialName",
]
LIST_FIELDS = ["keyRules", "importantNotes"]


def read_key() -> str:
    import os
    if os.environ.get("DEEPL_API_KEY"):
        return os.environ["DEEPL_API_KEY"].strip()
    for p in KEY_PATHS:
        if p.exists():
            return p.read_text().strip()
    raise SystemExit(f"DeepL-nyckel saknas (env DEEPL_API_KEY eller {KEY_PATHS[0]})")


def deepl_endpoint(api_key: str) -> str:
    return ("https://api-free.deepl.com/v2/translate"
            if api_key.endswith(":fx")
            else "https://api.deepl.com/v2/translate")


def translate_batch(texts: list[str], source: str, api_key: str) -> list[str]:
    out: list[str] = []
    for i in range(0, len(texts), 50):
        chunk = texts[i:i + 50]
        resp = requests.post(
            deepl_endpoint(api_key),
            headers={"Authorization": f"DeepL-Auth-Key {api_key}"},
            data=[("source_lang", source), ("target_lang", "EN-US"),
                  ("preserve_formatting", "1")]
            + [("text", t) for t in chunk],
            timeout=120,
        )
        resp.raise_for_status()
        out.extend(t["text"] for t in resp.json()["translations"])
    return out


def load_countries() -> dict:
    for rel in ("data/live/countries.json", "data/snapshots/countries.json"):
        p = SITE_ROOT / rel
        if p.exists():
            return json.loads(p.read_text())
    raise SystemExit("countries.json saknas — kör: npm run fetch-data")


def source_payload(c: dict) -> dict:
    """Exakt de källfält som översätts — hashas för staleness."""
    return {
        **{f: c.get(f) for f in STRING_FIELDS},
        **{f: c.get(f, []) for f in LIST_FIELDS},
        "primaryLinks": [
            {"title": l.get("title", ""), "description": l.get("description", "")}
            for l in c.get("primaryLinks", [])
        ],
        "secondaryLinks": [
            {"title": l.get("title", ""), "description": l.get("description", "")}
            for l in c.get("secondaryLinks", [])
        ],
    }


def source_hash(c: dict) -> str:
    canon = json.dumps(source_payload(c), ensure_ascii=False, sort_keys=True,
                       separators=(",", ":"))
    return hashlib.sha256(canon.encode()).hexdigest()


def collect_texts(c: dict) -> tuple[list[str], list[tuple]]:
    """Plattar ut alla texter + kom-ihåg-lista för återmontering."""
    texts: list[str] = []
    slots: list[tuple] = []  # (kind, *addr)

    for f in STRING_FIELDS:
        v = c.get(f)
        if v:
            slots.append(("str", f))
            texts.append(v)
    for f in LIST_FIELDS:
        for i, v in enumerate(c.get(f, [])):
            slots.append(("list", f, i))
            texts.append(v)
    for lf in ("primaryLinks", "secondaryLinks"):
        for i, link in enumerate(c.get(lf, [])):
            if link.get("title"):
                slots.append(("link", lf, i, "title"))
                texts.append(link["title"])
            if link.get("description"):
                slots.append(("link", lf, i, "description"))
                texts.append(link["description"])
    return texts, slots


def assemble(c: dict, slots: list[tuple], translated: list[str]) -> dict:
    fields: dict = {f: [None] * len(c.get(f, [])) for f in LIST_FIELDS}
    fields["primaryLinks"] = [
        {"title": l.get("title", ""), "description": l.get("description", "")}
        for l in c.get("primaryLinks", [])
    ]
    fields["secondaryLinks"] = [
        {"title": l.get("title", ""), "description": l.get("description", "")}
        for l in c.get("secondaryLinks", [])
    ]
    for slot, text in zip(slots, translated):
        if slot[0] == "str":
            fields[slot[1]] = text
        elif slot[0] == "list":
            fields[slot[1]][slot[2]] = text
        elif slot[0] == "link":
            fields[slot[1]][slot[2]][slot[3]] = text
    # Rensa list-hål (None) om källfält var tomma
    for f in LIST_FIELDS:
        fields[f] = [t for t in fields[f] if t is not None]
    return fields


def write_overlay(iso: str, c: dict, fields: dict, version: int, engine: str):
    EN_DIR.mkdir(parents=True, exist_ok=True)
    overlay = {
        "meta": {
            "sourceHash": source_hash(c),
            "sourceCountriesVersion": version,
            "sourceLastVerified": c.get("lastVerified"),
            "translatedAt": date.today().isoformat(),
            "engine": engine,
        },
        "fields": fields,
    }
    out = EN_DIR / f"{iso}.json"
    out.write_text(json.dumps(overlay, ensure_ascii=False, indent=2) + "\n")
    print(f"  ✓ {out.relative_to(SITE_ROOT)} ({engine})")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    stale_only = "--stale-only" in sys.argv

    data = load_countries()
    version = data.get("version", 0)
    countries = [c for c in data["countries"]
                 if c["isoCode"] != "OTHER" and c.get("languageCode") != "en"]
    if args:
        wanted = {a.upper() for a in args}
        countries = [c for c in countries if c["isoCode"].upper() in wanted]

    todo = []
    for c in countries:
        iso = c["isoCode"].upper()
        existing = EN_DIR / f"{iso}.json"
        if existing.exists():
            meta = json.loads(existing.read_text()).get("meta", {})
            if meta.get("sourceHash") == source_hash(c):
                continue  # färsk
            if not stale_only and not args:
                pass  # ohashad match → översätt om
        elif stale_only:
            todo.append(c)  # saknas = stale
            continue
        todo.append(c)

    if not todo:
        print("Alla EN-overlays är färska.")
        return

    api_key = None
    for c in todo:
        iso = c["isoCode"].upper()
        lang = c["languageCode"]
        print(f"{iso} ({lang}) — {len(collect_texts(c)[0])} texter")

        if lang in MANUAL_LANGS:
            # Stub med KÄLLTEXT — översätts för hand/Claude, sen engine→manual behålls
            texts, slots = collect_texts(c)
            fields = assemble(c, slots, texts)  # källtext som platshållare
            write_overlay(iso, c, fields, version, "manual")
            print(f"  ⚠ {lang} stöds ej av DeepL — STUB med källtext, översätt manuellt!")
            continue

        if lang not in SOURCE_LANGS:
            print(f"  ⚠ okänt källspråk {lang} — hoppar")
            continue

        if api_key is None:
            api_key = read_key()
        texts, slots = collect_texts(c)
        translated = translate_batch(texts, SOURCE_LANGS[lang], api_key)
        fields = assemble(c, slots, translated)
        write_overlay(iso, c, fields, version, "deepl")

    print(f"\nKlart: {len(todo)} länder.")


if __name__ == "__main__":
    main()
