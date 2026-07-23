#!/usr/bin/env node
/**
 * v8-revision, andra vågen: HÅLLNA EASA-mallar (crowd/night) fick korrigerad
 * text i basen (generatorn, `should_hold` → VERIFIED). Till skillnad från första
 * vågen (ren borttagning) är detta en TEXTERSÄTTNING på en position → varje
 * överlägg måste få den korrigerade ÖVERSÄTTNINGEN på samma position, annars
 * visar överläggsspråket kvar den gamla (över-strikta) lydelsen medan basen är
 * rättad. Positionerna (TRIMMADE, post-borttagning) + crowd/night-typ läses ur
 * legal-generatorns rapport; översättningarna ur held-corrections.json (27 språk).
 *
 * Kör EFTER att basen (data/live||data/snapshots) uppdaterats till den korrigerade
 * v8preview — annars stämplas överläggen mot en bas som inte finns än (staleness-CI
 * spricker). Hash-recept KOPIERADE exakt ur check-en-staleness.mjs (icke-EN, 64-char)
 * och check-matrix-staleness.mjs (EN-nativa, 32-char) — håll i synk.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const CONTENT = join(ROOT, 'src', 'content');
const APP = '/Users/kristoffernordgren/Developer/dk-legal-v8';
const REPORT = join(APP, 'tools/legal/generation-report.json');
const CORRECTIONS = join(APP, 'tools/legal/held-corrections.json');

const STRING_FIELDS = ['disclaimerText', 'sectionLabelRules', 'sectionLabelPrimary',
  'sectionLabelSecondary', 'linksSheetTitle', 'dronePilotCredentialName'];
const LIST_FIELDS = ['keyRules', 'importantNotes'];

function loadCountries() {
  for (const rel of ['data/live/countries.json', 'data/snapshots/countries.json']) {
    const p = join(ROOT, rel);
    if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
  }
  throw new Error('countries.json saknas');
}

// --- icke-EN: 64-char (check-en-staleness.mjs) ---
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
  const p = {};
  for (const f of STRING_FIELDS) p[f] = c[f] ?? null;
  for (const f of LIST_FIELDS) p[f] = c[f] ?? [];
  p.primaryLinks = (c.primaryLinks ?? []).map((l) => ({ title: l.title ?? '', description: l.description ?? '' }));
  p.secondaryLinks = (c.secondaryLinks ?? []).map((l) => ({ title: l.title ?? '', description: l.description ?? '' }));
  return p;
}
const enHash = (c) => createHash('sha256').update(canonical(sourcePayload(c)), 'utf8').digest('hex');

// --- EN-nativa: 32-char (check-matrix-staleness.mjs) ---
function fieldsFromCountry(c) {
  const f = {};
  for (const k of STRING_FIELDS) if (c[k]) f[k] = c[k];
  for (const k of LIST_FIELDS) f[k] = c[k] ?? [];
  f.primaryLinks = (c.primaryLinks ?? []).map((l) => ({ title: l.title ?? '', description: l.description ?? '' }));
  f.secondaryLinks = (c.secondaryLinks ?? []).map((l) => ({ title: l.title ?? '', description: l.description ?? '' }));
  return f;
}
const matrixHash = (obj) => createHash('sha256').update(JSON.stringify(obj), 'utf8').digest('hex').slice(0, 32);

// --- korrigerade positioner per land ur rapporten ---
const report = JSON.parse(readFileSync(REPORT, 'utf8'));
const corrections = JSON.parse(readFileSync(CORRECTIONS, 'utf8'));
const correctedByIso = {};
for (const [iso, cr] of Object.entries(report.countries)) {
  if (cr.corrected?.length) correctedByIso[iso] = cr.corrected;
}

const base = loadCountries();
const byIso = new Map(base.countries.map((c) => [c.isoCode.toUpperCase(), c]));
const langs = readdirSync(CONTENT).filter((l) => l !== 'faq-overrides');

let touched = 0, replaced = 0, skipped = 0;
for (const [iso, corr] of Object.entries(correctedByIso)) {
  const c = byIso.get(iso);
  if (!c) { console.warn(`SKIP ${iso}: saknas i base`); continue; }
  const isEN = c.languageCode === 'en';
  const newHash = isEN ? matrixHash(fieldsFromCountry(c)) : enHash(c);
  for (const lang of langs) {
    if (isEN && lang === 'en') continue; // EN-nativa har inget en-överlägg
    const p = join(CONTENT, lang, `${iso}.json`);
    if (!existsSync(p)) continue;
    const raw = readFileSync(p, 'utf8');
    const ov = JSON.parse(raw);
    let changed = false, overlaySkipped = false;
    for (const { field, index, kind } of corr) {
      const arr = ov.fields?.[field];
      if (!Array.isArray(arr)) continue;
      // basens fältlängd MÅSTE stämma med överläggets — annars är positionen
      // opålitlig (överlägget är redan stale, t.ex. hu/EE saknar 2 rader) →
      // lämna HELA överlägget orört så staleness-vakten fortsätter flagga det
      // (omstämpling här skulle maskera ett äkta glapp).
      if (arr.length !== (c[field]?.length || 0)) {
        console.warn(`SKIP ${lang}/${iso} ${field}: överläggslängd ${arr.length} ≠ bas ${c[field]?.length} (redan stale, lämnas orört)`);
        skipped++;
        overlaySkipped = true;
        break;
      }
      const text = corrections[kind]?.[lang];
      if (!text) { console.warn(`SKIP ${lang}/${iso}: ingen ${kind}-översättning för ${lang}`); skipped++; overlaySkipped = true; break; }
      if (arr[index] !== text) { arr[index] = text; replaced++; changed = true; }
    }
    if (overlaySkipped) continue; // rör inte hash/fil — förbli ärligt flaggat stale
    ov.meta = ov.meta || {};
    const hashChanged = ov.meta.sourceHash !== newHash;
    ov.meta.sourceHash = newHash;
    if (changed || hashChanged) {
      const indent = raw.match(/^\{\n( +)"/)?.[1].length ?? 2;
      writeFileSync(p, JSON.stringify(ov, null, indent) + (raw.endsWith('\n') ? '\n' : ''));
      if (changed) touched++;
    }
  }
}
console.log(`Klar: ${touched} överlägg textändrade, ${replaced} rader ersatta, ${skipped} hoppade. Länder: ${Object.keys(correctedByIso).length}`);
