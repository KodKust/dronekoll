#!/usr/bin/env node
/**
 * Matris-staleness (CI, icke-blockerande): jämför varje matriscells
 * meta.sourceHash mot förväntad källhash — samma recept som cell-endpointens
 * stale-flagga (src/lib/staleness.ts, KORSREFERERA vid ändring):
 *  - icke-EN-land: förväntad = EN-overlayns meta.sourceHash
 *  - EN-nativt land: trunkerad sha256(JSON.stringify(fields)) —
 *    spegel av build-matrix-source.mjs fieldsFromCountry()
 * EN-katalogen vaktas separat av check-en-staleness.mjs (python-receptet).
 *
 * Stale celler skeppar ändå (endpointen flaggar dem; appen faller till
 * native) — detta script är siktdjup, inte grind. Exit 0 alltid.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const CONTENT = join(ROOT, 'src', 'content');
const EN_DIR = join(CONTENT, 'en');

const STRING_FIELDS = [
  'disclaimerText', 'sectionLabelRules', 'sectionLabelPrimary',
  'sectionLabelSecondary', 'linksSheetTitle', 'dronePilotCredentialName',
];
const LIST_FIELDS = ['keyRules', 'importantNotes'];

function loadCountries() {
  for (const rel of ['data/live/countries.json', 'data/snapshots/countries.json']) {
    const p = join(ROOT, rel);
    if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
  }
  throw new Error('countries.json saknas — kör npm run fetch-data');
}

function fieldsFromCountry(c) {
  const f = {};
  for (const k of STRING_FIELDS) if (c[k]) f[k] = c[k];
  for (const k of LIST_FIELDS) f[k] = c[k] ?? [];
  f.primaryLinks = (c.primaryLinks ?? []).map((l) => ({ title: l.title ?? '', description: l.description ?? '' }));
  f.secondaryLinks = (c.secondaryLinks ?? []).map((l) => ({ title: l.title ?? '', description: l.description ?? '' }));
  return f;
}

const matrixHash = (obj) =>
  createHash('sha256').update(JSON.stringify(obj), 'utf8').digest('hex').slice(0, 32);

const countriesByIso = new Map(
  loadCountries().countries
    .filter((c) => c.isoCode !== 'OTHER')
    .map((c) => [c.isoCode.toUpperCase(), c]),
);

function expectedHash(iso) {
  const country = countriesByIso.get(iso);
  if (!country) return null;
  if (country.languageCode !== 'en') {
    const p = join(EN_DIR, `${iso}.json`);
    if (!existsSync(p)) return null;
    return JSON.parse(readFileSync(p, 'utf8')).meta?.sourceHash ?? null;
  }
  return matrixHash(fieldsFromCountry(country));
}

let cells = 0;
let stale = 0;
const staleByLang = {};

for (const lang of readdirSync(CONTENT)) {
  const dir = join(CONTENT, lang);
  if (lang === 'en' || lang === 'faq-overrides') continue;
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    continue; // fil, inte katalog
  }
  for (const f of entries) {
    if (!f.endsWith('.json') || f.startsWith('_')) continue;
    const iso = f.replace(/\.json$/, '').toUpperCase();
    cells++;
    const cell = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const expected = expectedHash(iso);
    if (expected !== null && cell.meta?.sourceHash !== expected) {
      stale++;
      (staleByLang[lang] ??= []).push(iso);
    }
  }
}

if (stale === 0) {
  console.log(`✅ Matris-staleness: ${cells} celler, 0 stale`);
} else {
  console.log(`⚠ Matris-staleness: ${stale}/${cells} celler STALE (källan ändrad efter översättning):`);
  for (const [lang, isos] of Object.entries(staleByLang)) {
    console.log(`   ${lang}: ${isos.join(', ')}`);
  }
  console.log('   Cellerna flaggas stale i /api/cell/ (appen visar native). Kör om matris-översättningen för listan ovan.');
}
process.exit(0);
