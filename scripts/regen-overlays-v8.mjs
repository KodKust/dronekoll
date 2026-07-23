#!/usr/bin/env node
/**
 * v8-revision: mekanisk överlägg-regen efter borttagning av felaktiga regler.
 * Vi TOG BORT rader (ändrade ingen ordalydelse) → översättningarna av kvarvarande
 * rader är fortfarande giltiga. Droppar därför samma positioner ur varje överlägg +
 * stämplar om sourceHash till nya basen. INGEN DeepL behövs.
 *
 * Hash-recept KOPIERADE exakt ur check-en-staleness.mjs (icke-EN, 64-char) och
 * check-matrix-staleness.mjs (EN-nativa, 32-char) — måste hållas i synk vid ändring.
 *
 * Positioner läses ur legal-generatorns rapport (app-repot). Validerar att varje
 * överläggs fältlängd == ursprunglig baslängd före borttagning; annars HOPPAS fältet.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const CONTENT = join(ROOT, 'src', 'content');
const REPORT = '/Users/kristoffernordgren/Developer/dk-legal-v8/tools/legal/generation-report.json';
const NEW_VERSION = 197;

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

// --- borttagna positioner per land/fält ur rapporten ---
const report = JSON.parse(readFileSync(REPORT, 'utf8'));
const removedByIso = {};
for (const [iso, cr] of Object.entries(report.countries)) {
  for (const r of cr.removed || []) {
    const m = r.claimId.match(/-(\d+)$/);
    if (!m) continue;
    (removedByIso[iso] ??= { keyRules: [], importantNotes: [] })[r.field].push(parseInt(m[1], 10) - 1);
  }
}

const base = loadCountries();
const byIso = new Map(base.countries.map((c) => [c.isoCode.toUpperCase(), c]));
const langs = readdirSync(CONTENT).filter((l) => l !== 'faq-overrides');

let touched = 0, skipped = 0;
for (const [iso, fields] of Object.entries(removedByIso)) {
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
    let changed = false;
    for (const field of LIST_FIELDS) {
      const idxs = fields[field] || [];
      if (!idxs.length) continue;
      const arr = ov.fields?.[field];
      if (!Array.isArray(arr)) continue;
      const expectedOrig = (c[field]?.length || 0) + idxs.length;
      if (arr.length !== expectedOrig) {
        console.warn(`SKIP ${lang}/${iso} ${field}: längd ${arr.length} ≠ förväntad ${expectedOrig}`);
        skipped++;
        continue;
      }
      ov.fields[field] = arr.filter((_, i) => !idxs.includes(i));
      changed = true;
    }
    ov.meta = ov.meta || {};
    ov.meta.sourceHash = newHash;
    // Bevara originalformat surgiskt: indent (1 för lang-överlägg, 2 för en) +
    // trailing newline. Endast sourceHash + borttagna rader ska diffa.
    const indent = raw.match(/^\{\n( +)"/)?.[1].length ?? 2;
    writeFileSync(p, JSON.stringify(ov, null, indent) + (raw.endsWith('\n') ? '\n' : ''));
    if (changed) touched++;
  }
}
console.log(`Klar: ${touched} överlägg uppdaterade, ${skipped} fält hoppade. Länder: ${Object.keys(removedByIso).join(', ')}`);
