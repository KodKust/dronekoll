#!/usr/bin/env node
/**
 * EN-staleness-koll (CI, icke-blockerande): jämför varje EN-overlays
 * meta.sourceHash mot en färsk hash av källfälten i aktuell countries.json.
 * Stale EN-copy skeppar ändå (graciös degradering) men listas som varning →
 * kör `python3 scripts/translate_en.py --stale-only` för att uppdatera.
 *
 * Hash-recept = translate_en.py:s source_payload: sorterade nycklar,
 * kompakta separatorer, ensure_ascii=False-ekvivalent (ren UTF-8).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const EN_DIR = join(ROOT, 'src', 'content', 'en');

const STRING_FIELDS = [
  'disclaimerText',
  'sectionLabelRules',
  'sectionLabelPrimary',
  'sectionLabelSecondary',
  'linksSheetTitle',
  'dronePilotCredentialName',
];
const LIST_FIELDS = ['keyRules', 'importantNotes'];

function loadCountries() {
  for (const rel of ['data/live/countries.json', 'data/snapshots/countries.json']) {
    const p = join(ROOT, rel);
    if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
  }
  throw new Error('countries.json saknas — kör npm run fetch-data');
}

/** Python json.dumps(sort_keys=True, separators=(",",":")) — nyckelsorterad kompakt JSON. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  if (value === undefined) return 'null';
  return JSON.stringify(value);
}

function sourcePayload(c) {
  const payload = {};
  for (const f of STRING_FIELDS) payload[f] = c[f] ?? null;
  for (const f of LIST_FIELDS) payload[f] = c[f] ?? [];
  payload.primaryLinks = (c.primaryLinks ?? []).map((l) => ({
    title: l.title ?? '',
    description: l.description ?? '',
  }));
  payload.secondaryLinks = (c.secondaryLinks ?? []).map((l) => ({
    title: l.title ?? '',
    description: l.description ?? '',
  }));
  return payload;
}

const data = loadCountries();
const nonEn = data.countries.filter((c) => c.isoCode !== 'OTHER' && c.languageCode !== 'en');

const stale = [];
const missing = [];
for (const c of nonEn) {
  const iso = c.isoCode.toUpperCase();
  const overlayPath = join(EN_DIR, `${iso}.json`);
  if (!existsSync(overlayPath)) {
    missing.push(iso);
    continue;
  }
  const overlay = JSON.parse(readFileSync(overlayPath, 'utf8'));
  const freshHash = createHash('sha256').update(canonical(sourcePayload(c)), 'utf8').digest('hex');
  if (overlay.meta?.sourceHash !== freshHash) stale.push(iso);
}

if (missing.length) console.log(`SAKNAS (${missing.length}): ${missing.join(' ')}`);
if (stale.length) console.log(`STALE (${stale.length}): ${stale.join(' ')}`);
if (!missing.length && !stale.length) console.log(`✓ Alla ${nonEn.length} EN-overlays färska.`);

// Icke-blockerande: exit 0 alltid — STRICT_EN-grinden i bygget hanterar SAKNAS.
