#!/usr/bin/env python3
"""QA-svep över språkmatrisens innehålls-overlays (src/content/{lang}/{ISO}.json).

Jämför varje icke-EN-overlay mot motsvarande en/-fil (översättningskällan) och
flaggar trolig-fel-klasser från it4-batchen. Läs-endast; skriver Markdown-rapport.

Kategorier (allvarligast först):
  CREDENTIAL  dronePilotCredentialName identisk med EN ("Drone Map"-klassen)
  IDENTISK    översättningsbar text (≥4 ord) identisk med EN — trolig oöversatt rest
  TOM         tomt värde där EN har innehåll
  NYCKEL      saknade/extra fields-nycklar vs EN
  PLACEHOLDER rå {0}/{1}/{country}/{date} kvar i text
  ESCAPE      &amp;amp;-dubblar eller råa <b>/<p>-taggar
  SKRIPT      bg/el/uk-sträng ≥4 ord helt utan kyrilliska/grekiska tecken
  EN-ORD      ≥2 engelska funktionsord i samma sträng (info — kan vara egennamn)

Kör:  python3 scripts/qa-matrix-sweep.py [--out RAPPORT.md]
"""
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "src" / "content"

# Fält vars strängar SKA vara identiska med EN (jämförs ej)
SKIP_KEYS = {"url", "id"}
# Textfält som ska vara översatta
TEXT_FIELDS = [
    "keyRules", "importantNotes", "disclaimerText", "linksSheetTitle",
    "sectionLabelPrimary", "sectionLabelRules", "sectionLabelSecondary",
]
LINK_FIELDS = ["primaryLinks", "secondaryLinks"]

PLACEHOLDER_RE = re.compile(r"\{(?:\d+|country|date)\}")
ESCAPE_RE = re.compile(r"&amp;amp;|</?(?:b|p|i|br)\b[^>]*>", re.I)
EN_WORDS_RE = re.compile(
    r"\b(the|and|must|with|shall|your|from|are|not allowed)\b", re.I
)
CYRILLIC_RE = re.compile(r"[Ѐ-ӿ]")
GREEK_RE = re.compile(r"[Ͱ-Ͽ]")
NON_LATIN = {"bg": CYRILLIC_RE, "uk": CYRILLIC_RE, "el": GREEK_RE}


def words(s: str) -> int:
    return len(re.findall(r"[^\W\d_]{2,}", s, re.UNICODE))


def mostly_symbolic(s: str) -> bool:
    alpha = sum(c.isalpha() for c in s)
    return alpha < max(4, len(s) * 0.35)


def iter_strings(fields: dict):
    """Yield (label, sträng) för alla översättningsbara strängar i en overlay."""
    for key in TEXT_FIELDS:
        v = fields.get(key)
        if isinstance(v, str):
            yield key, v
        elif isinstance(v, list):
            for i, item in enumerate(v):
                if isinstance(item, str):
                    yield f"{key}[{i}]", item
    for key in LINK_FIELDS:
        for i, link in enumerate(fields.get(key) or []):
            if isinstance(link, dict):
                for sub in ("title", "description"):
                    if isinstance(link.get(sub), str):
                        yield f"{key}[{i}].{sub}", link[sub]


def main() -> int:
    out_path = None
    if "--out" in sys.argv:
        out_path = Path(sys.argv[sys.argv.index("--out") + 1])

    en_dir = CONTENT / "en"
    en_cache = {p.stem: json.loads(p.read_text()) for p in en_dir.glob("*.json")}

    # EN-native-länder (AE/AU/CA/GB/…) saknar en/-fil — EN-källan är countries.json,
    # vars land-objekt bär exakt samma fältnamn som overlay-fields.
    countries_file = ROOT / "data" / "live" / "countries.json"
    if not countries_file.exists():
        countries_file = ROOT / "data" / "snapshots" / "countries.json"
    all_fields = TEXT_FIELDS + LINK_FIELDS + ["dronePilotCredentialName"]
    for c in json.loads(countries_file.read_text())["countries"]:
        iso = c.get("isoCode")
        if iso and iso != "OTHER" and iso not in en_cache:
            en_cache[iso] = {
                "fields": {k: c[k] for k in all_fields if c.get(k) is not None}
            }

    langs = sorted(
        d.name
        for d in CONTENT.iterdir()
        if d.is_dir() and d.name not in ("en", "faq-overrides")
    )
    findings = defaultdict(list)  # lang -> [(kategori, ISO, label, utdrag)]
    counts = defaultdict(lambda: defaultdict(int))  # lang -> kategori -> n
    files_per_lang = {}

    for lang in langs:
        files = sorted((CONTENT / lang).glob("*.json"))
        files_per_lang[lang] = len(files)
        script_re = NON_LATIN.get(lang)

        for path in files:
            iso = path.stem
            try:
                ov = json.loads(path.read_text())
            except json.JSONDecodeError as e:
                findings[lang].append(("TRASIG-JSON", iso, "-", str(e)))
                counts[lang]["TRASIG-JSON"] += 1
                continue
            fields = ov.get("fields") or {}
            en_fields = (en_cache.get(iso) or {}).get("fields") or {}

            # NYCKEL-paritet
            missing = set(en_fields) - set(fields)
            extra = set(fields) - set(en_fields)
            for k in sorted(missing):
                findings[lang].append(("NYCKEL", iso, k, "saknas (finns i EN)"))
                counts[lang]["NYCKEL"] += 1
            for k in sorted(extra):
                findings[lang].append(("NYCKEL", iso, k, "extra (saknas i EN)"))
                counts[lang]["NYCKEL"] += 1

            # CREDENTIAL — identisk med EN
            cred, en_cred = fields.get("dronePilotCredentialName"), en_fields.get(
                "dronePilotCredentialName"
            )
            if (
                cred and en_cred and cred == en_cred
                and re.search(r"[A-Za-z]{4,}", en_cred)
            ):
                findings[lang].append(("CREDENTIAL", iso, "dronePilotCredentialName", cred))
                counts[lang]["CREDENTIAL"] += 1

            en_strings = dict(iter_strings(en_fields))
            for label, s in iter_strings(fields):
                if not s.strip():
                    if (en_strings.get(label) or "").strip():
                        findings[lang].append(("TOM", iso, label, "(tom, EN har text)"))
                        counts[lang]["TOM"] += 1
                    continue
                if PLACEHOLDER_RE.search(s):
                    findings[lang].append(("PLACEHOLDER", iso, label, s[:90]))
                    counts[lang]["PLACEHOLDER"] += 1
                if ESCAPE_RE.search(s):
                    findings[lang].append(("ESCAPE", iso, label, s[:90]))
                    counts[lang]["ESCAPE"] += 1
                en_s = en_strings.get(label)
                if (
                    en_s and s == en_s and words(s) >= 4 and not mostly_symbolic(s)
                ):
                    findings[lang].append(("IDENTISK", iso, label, s[:90]))
                    counts[lang]["IDENTISK"] += 1
                elif script_re and words(s) >= 4 and not script_re.search(s):
                    findings[lang].append(("SKRIPT", iso, label, s[:90]))
                    counts[lang]["SKRIPT"] += 1
                elif en_s and s != en_s:
                    hits = {m.lower() for m in EN_WORDS_RE.findall(s)}
                    if len(hits) >= 2:
                        findings[lang].append(("EN-ORD", iso, label, s[:90]))
                        counts[lang]["EN-ORD"] += 1

    # ── Rapport ──────────────────────────────────────────────────────────────
    order = [
        "TRASIG-JSON", "CREDENTIAL", "IDENTISK", "TOM", "NYCKEL",
        "PLACEHOLDER", "ESCAPE", "SKRIPT", "EN-ORD",
    ]
    lines = ["# QA-svep — språkmatrisens overlays", ""]
    total_files = sum(files_per_lang.values())
    total_hits = sum(sum(c.values()) for c in counts.values())
    hard = sum(
        n for c in counts.values() for k, n in c.items() if k not in ("EN-ORD",)
    )
    lines += [
        f"**{total_files} overlays × {len(langs)} språk svepta** — "
        f"{hard} skarpa flaggor + {total_hits - hard} info (EN-ORD).",
        "",
        "| Språk | Filer | " + " | ".join(order) + " |",
        "|---|---|" + "|".join(["---"] * len(order)) + "|",
    ]
    for lang in langs:
        row = [str(counts[lang].get(k, "") or "·") for k in order]
        lines.append(f"| {lang} | {files_per_lang[lang]} | " + " | ".join(row) + " |")
    lines.append("")

    for lang in langs:
        if not findings[lang]:
            continue
        lines.append(f"## {lang}")
        by_cat = defaultdict(list)
        for cat, iso, label, ex in findings[lang]:
            by_cat[cat].append((iso, label, ex))
        for cat in order:
            if cat not in by_cat:
                continue
            lines.append(f"### {cat} ({len(by_cat[cat])})")
            for iso, label, ex in by_cat[cat][:40]:
                lines.append(f"- **{iso}** `{label}` — {ex}")
            if len(by_cat[cat]) > 40:
                lines.append(f"- … +{len(by_cat[cat]) - 40} till")
        lines.append("")

    report = "\n".join(lines)
    if out_path:
        out_path.write_text(report)
        print(f"✓ rapport → {out_path} ({total_hits} flaggor i {total_files} filer)")
    else:
        print(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
