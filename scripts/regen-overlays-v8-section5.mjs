#!/usr/bin/env node
/**
 * v8-revision, avsnitt-5 SE-rättelser: per-claim redaktionella korrigeringar
 * (SE-KR-02/SE-IN-03/SE-IN-04) fick ny text + status i basen via generatorns
 * override-lager. Detta script speglar dem i sajtens överlägg (26 språk), inkl.
 * RESHAPE när en tidigare borttagen claim återinförs (SE-IN-04: överlägg 4→5).
 *
 * Walk-algoritm per fält: gå igenom basens positioner; section5-position → använd
 * översättningen (ur section5-overlay-translations.json); annars → nästa befintliga
 * överläggspost. wasRemoved-position = INSERT (överlägget saknade posten) → flytta
 * inte markören. Validerar att alla överläggsposter konsumeras, annars hoppas
 * överlägget (redan stale — lämnas ärligt flaggat). Hash-recept ur staleness-vakterna.
 *
 * Kör EFTER att basen (data/live||snapshots) uppdaterats till korrigerad v8preview.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const CONTENT = join(ROOT, 'src', 'content');
const APP = '/Users/kristoffernordgren/Developer/dk-legal-v8';
const REPORT = join(APP, 'tools/legal/generation-report.json');
const TRANSLATIONS = join(APP, 'tools/legal/section5-overlay-translations.json');

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
function fieldsFromCountry(c) {
  const f = {};
  for (const k of STRING_FIELDS) if (c[k]) f[k] = c[k];
  for (const k of LIST_FIELDS) f[k] = c[k] ?? [];
  f.primaryLinks = (c.primaryLinks ?? []).map((l) => ({ title: l.title ?? '', description: l.description ?? '' }));
  f.secondaryLinks = (c.secondaryLinks ?? []).map((l) => ({ title: l.title ?? '', description: l.description ?? '' }));
  return f;
}
const matrixHash = (obj) => createHash('sha256').update(JSON.stringify(obj), 'utf8').digest('hex').slice(0, 32);

const report = JSON.parse(readFileSync(REPORT, 'utf8'));
const translations = JSON.parse(readFileSync(TRANSLATIONS, 'utf8'));
const s5ByIso = {};
for (const [iso, cr] of Object.entries(report.countries)) {
  if (cr.section5?.length) s5ByIso[iso] = cr.section5;
}

const base = loadCountries();
const byIso = new Map(base.countries.map((c) => [c.isoCode.toUpperCase(), c]));
const langs = readdirSync(CONTENT).filter((l) => l !== 'faq-overrides');

let touched = 0, skipped = 0;
for (const [iso, entries] of Object.entries(s5ByIso)) {
  const c = byIso.get(iso);
  if (!c) { console.warn(`SKIP ${iso}: saknas i base`); continue; }
  const isEN = c.languageCode === 'en';
  const newHash = isEN ? matrixHash(fieldsFromCountry(c)) : enHash(c);
  // gruppera section5-poster per fält → { field: {index: {claimId, wasRemoved}} }
  const byField = {};
  for (const e of entries) (byField[e.field] ??= {})[e.index] = e;

  for (const lang of langs) {
    if (isEN && lang === 'en') continue;
    const p = join(CONTENT, lang, `${iso}.json`);
    if (!existsSync(p)) continue;
    const raw = readFileSync(p, 'utf8');
    const ov = JSON.parse(raw);
    let overlaySkipped = false, changed = false;

    for (const field of LIST_FIELDS) {
      const s5 = byField[field];
      if (!s5) continue;
      const baseArr = c[field] || [];
      const ovArr = ov.fields?.[field];
      if (!Array.isArray(ovArr)) { overlaySkipped = true; break; }
      const newArr = [];
      let cursor = 0;
      for (let bi = 0; bi < baseArr.length; bi++) {
        const e = s5[bi];
        if (e) {
          const t = translations[lang]?.[e.claimId];
          if (!t) { console.warn(`SKIP ${lang}/${iso} ${field}: ingen översättning för ${e.claimId}`); overlaySkipped = true; break; }
          newArr.push(t);
          if (!e.wasRemoved) cursor++; // ersätter befintlig post
        } else {
          if (cursor >= ovArr.length) { overlaySkipped = true; break; }
          newArr.push(ovArr[cursor++]);
        }
      }
      if (overlaySkipped) break;
      if (cursor !== ovArr.length) { // överlägget hade oväntad form → lämna orört
        console.warn(`SKIP ${lang}/${iso} ${field}: konsumerade ${cursor}/${ovArr.length} överläggsposter (oväntad form)`);
        overlaySkipped = true; break;
      }
      ov.fields[field] = newArr;
      changed = true;
    }
    if (overlaySkipped) continue; // förbli ärligt flaggat stale

    ov.meta = ov.meta || {};
    ov.meta.sourceHash = newHash;
    const indent = raw.match(/^\{\n( +)"/)?.[1].length ?? 2;
    writeFileSync(p, JSON.stringify(ov, null, indent) + (raw.endsWith('\n') ? '\n' : ''));
    if (changed) touched++;
  }
}
console.log(`Klar: ${touched} SE-överlägg uppdaterade, ${skipped} hoppade. Länder: ${Object.keys(s5ByIso).join(', ')}`);
