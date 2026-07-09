#!/usr/bin/env python3
"""Fyller web_strings.json med 26 språk ur EN-kolumnen (fas 7).

Samma DeepL-konventioner som translate_en.py. {param}-platshållare skyddas
med DeepL:s tag-hantering (xml, <x id=n/>) så de överlever översättning
oförvanskade. IS/HR/MT stöds ej → lämnas tomma (i18n.t faller till EN) och
översätts manuellt/Claude i samma fas.

    python3 scripts/translate_web_strings.py                          # web_strings, fyll saknade
    python3 scripts/translate_web_strings.py --force                  # skriv om alla
    python3 scripts/translate_web_strings.py --file data/feature-strings.json  # annan katalog
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import requests

SITE_ROOT = Path(__file__).resolve().parent.parent
STRINGS_PATH = SITE_ROOT / "data" / "web-strings" / "web_strings.json"
KEY_PATHS = [
    Path.home() / "Developer" / "dronarkartan" / ".secrets" / "deepl_api_key.txt",
]

# Målspråk → DeepL target (husets karta, batch_translate.py)
TARGETS = {
    "sv": "SV", "no": "NB", "da": "DA", "fi": "FI", "de": "DE", "fr": "FR",
    "es": "ES", "it": "IT", "pt": "PT-PT", "nl": "NL", "pl": "PL", "cs": "CS",
    "sk": "SK", "hu": "HU", "ro": "RO", "el": "EL", "et": "ET", "lv": "LV",
    "lt": "LT", "sl": "SL", "bg": "BG", "tr": "TR", "uk": "UK",
    # is, hr, mt — manuellt
}
MANUAL = {"is", "hr", "mt"}
PARAM_RE = re.compile(r"\{(\w+)\}")


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


def protect(text: str) -> tuple[str, list[str]]:
    """{param} → <x id="n"/> så DeepL lämnar platshållarna orörda.

    OBS: tag_handling=xml kräver XML-GILTIG text — nakna &/</> (t.ex.
    "registration & map") ger 400 Bad Request → escapa först (lärdom 2026-07-09).
    """
    params: list[str] = []

    def sub(m: re.Match) -> str:
        params.append(m.group(0))
        return f"\x00{len(params) - 1}\x00"

    tokenized = PARAM_RE.sub(sub, text)
    escaped = (tokenized.replace("&", "&amp;")
                        .replace("<", "&lt;")
                        .replace(">", "&gt;"))
    for i in range(len(params)):
        escaped = escaped.replace(f"\x00{i}\x00", f'<x id="{i}"/>')
    return escaped, params


def restore(text: str, params: list[str]) -> str:
    for i, p in enumerate(params):
        text = text.replace(f'<x id="{i}"/>', p)
    return (text.replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&amp;", "&"))


def translate(texts: list[str], target: str, api_key: str) -> list[str]:
    protected = [protect(t) for t in texts]
    out: list[str] = []
    for i in range(0, len(protected), 50):
        chunk = protected[i:i + 50]
        resp = requests.post(
            deepl_endpoint(api_key),
            headers={"Authorization": f"DeepL-Auth-Key {api_key}"},
            data=[("source_lang", "EN"), ("target_lang", target),
                  ("preserve_formatting", "1"), ("tag_handling", "xml"),
                  ("ignore_tags", "x")]
            + [("text", t) for (t, _) in chunk],
            timeout=120,
        )
        resp.raise_for_status()
        for (orig, params), tr in zip(chunk, resp.json()["translations"]):
            out.append(restore(tr["text"], params))
    return out


def main():
    force = "--force" in sys.argv
    path = STRINGS_PATH
    if "--file" in sys.argv:
        path = SITE_ROOT / sys.argv[sys.argv.index("--file") + 1]
    data = json.loads(path.read_text())
    keys = [k for k in data if not k.startswith("_")]

    api_key = read_key()
    for lang, target in TARGETS.items():
        pending = [k for k in keys if force or lang not in data[k]]
        if not pending:
            print(f"{lang}: komplett")
            continue
        en_texts = [data[k]["en"] for k in pending]
        print(f"{lang} ({target}): {len(pending)} strängar…", end=" ", flush=True)
        try:
            translated = translate(en_texts, target, api_key)
            for k, t in zip(pending, translated):
                data[k][lang] = t
            print("klart")
        except Exception as e:
            print(f"FEL: {e}")

    missing_manual = {
        lang: [k for k in keys if lang not in data[k]] for lang in MANUAL
    }
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    print(f"\nSkrivet: {path.relative_to(SITE_ROOT)}")
    for lang, missing in missing_manual.items():
        if missing:
            print(f"⚠ {lang}: {len(missing)} strängar kvar — översätt manuellt (DeepL saknar språket)")


if __name__ == "__main__":
    main()
