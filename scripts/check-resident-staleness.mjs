#!/usr/bin/env node
/**
 * Resident-staleness (CI, icke-blockerande): jämför varje resident-källas
 * meta.sourceHash (src/content-resident/{lang}/{ISO}.json) mot förväntad
 * hash ur countries.json + airspace_rules.json — samma recept som
 * cell-endpointen (src/lib/resident.ts, KORSREFERERA vid ändring).
 *
 * Stale ⇒ endpointen UTELÄMNAR resident-fälten (appen visar native för
 * checklista/onboarding/regler/språkade länkar) — matriscellen i övrigt
 * skeppas som vanligt. Skriptet är siktdjup, inte grind. Exit 0 alltid.
 *
 * Dessutom en strukturvakt per fil: antal checklistsektioner, items per
 * sektion, antal slides och regelnycklar måste matcha källan — annars
 * applicerar appen bara delar (per-index-parning kräver lika antal).
 *
 * Kör: node scripts/check-resident-staleness.mjs  (ingår i npm run check)
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { residentSource, residentHash } from './build-resident-source.mjs';

const ROOT = process.cwd();
const DIR = join(ROOT, 'src', 'content-resident');

function loadData(name) {
  for (const rel of [`data/live/${name}`, `data/snapshots/${name}`]) {
    const p = join(ROOT, rel);
    if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
  }
  throw new Error(`${name} saknas — kör npm run fetch-data`);
}

const countries = loadData('countries.json');
const rules = loadData('airspace_rules.json');
const byIso = new Map(countries.countries.map((c) => [c.isoCode?.toUpperCase(), c]));

let cells = 0;
let stale = 0;
let structural = 0;
if (existsSync(DIR)) {
  for (const lang of readdirSync(DIR)) {
    const dir = join(DIR, lang);
    let files;
    try {
      files = readdirSync(dir);
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.endsWith('.json') || f.startsWith('_')) continue;
      const iso = f.replace(/\.json$/, '').toUpperCase();
      cells++;
      const cell = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      const country = byIso.get(iso);
      if (!country) {
        console.log(`✗ resident ${lang}/${iso}: landet finns inte i countries.json`);
        structural++;
        continue;
      }
      const src = residentSource(country, rules);
      const expected = residentHash(src);
      if (cell.meta?.sourceHash !== expected) {
        stale++;
        console.log(
          `⚠ resident ${lang}/${iso}: STALE — översatt ur ${cell.meta?.sourceHash?.slice(0, 8)}…, källan är nu ${expected.slice(0, 8)}… (kör build-resident-source.mjs ${iso} och översätt om ändrade rader)`,
        );
      }
      const fl = cell.fields ?? {};
      const problems = [];
      if (fl.checklist && fl.checklist.length !== src.checklist.length)
        problems.push(`checklist ${fl.checklist.length} ≠ ${src.checklist.length} sektioner`);
      if (fl.checklist)
        fl.checklist.forEach((s, i) => {
          if (src.checklist[i] && s.items.length !== src.checklist[i].items.length)
            problems.push(`checklist[${i}] ${s.items.length} ≠ ${src.checklist[i].items.length} items`);
        });
      if (fl.onboarding && fl.onboarding.length !== src.onboarding.length)
        problems.push(`onboarding ${fl.onboarding.length} ≠ ${src.onboarding.length}`);
      if (fl.onboardingExtended && fl.onboardingExtended.length !== src.onboardingExtended.length)
        problems.push(`onboardingExtended ${fl.onboardingExtended.length} ≠ ${src.onboardingExtended.length}`);
      if (fl.rules) {
        const missing = Object.keys(src.rules).filter((k) => !(k in fl.rules));
        const extra = Object.keys(fl.rules).filter((k) => !(k in src.rules));
        if (missing.length) problems.push(`rules saknar ${missing.join(', ')}`);
        if (extra.length) problems.push(`rules bär okända ${extra.join(', ')}`);
      }
      if (fl.links) {
        for (const [id, url] of Object.entries(fl.links)) {
          const base = src.links[id];
          if (!base) problems.push(`links: okänt id ${id}`);
          else if (new URL(base).host !== new URL(url).host) problems.push(`links: ${id} byter värd`);
        }
      }
      if (fl.airspaceMapUrl && src.airspaceMapUrl) {
        if (new URL(fl.airspaceMapUrl).host !== new URL(src.airspaceMapUrl).host)
          problems.push('airspaceMapUrl byter värd');
      }
      // {0}-platshållare, radbrytningar och SIFFROR per sträng måste bevaras:
      // appen fyller i certifikattermen (en tappad platshållare ger en mening
      // utan subjekt), \n styr titelns radfall, och ett ändrat tal i en regel
      // (14 → 10 dagar, 250 g, 120 m) är ett sakfel — YMYL.
      const ph = (s) => (s.match(/\{0\}/g) ?? []).length;
      const nl = (s) => (s.match(/\n/g) ?? []).length;
      const digits = (s) => (s.match(/\d+(?:[.,]\d+)?/g) ?? []).sort().join('|');
      const cmp = (label, a, b) => {
        if (ph(a) !== ph(b)) problems.push(`${label}: platshållare {0} ${ph(a)} ≠ ${ph(b)}`);
        if (nl(a) !== nl(b)) problems.push(`${label}: radbrytningar ${nl(a)} ≠ ${nl(b)}`);
        if (digits(a) !== digits(b)) problems.push(`${label}: siffror [${digits(a)}] ≠ källans [${digits(b)}]`);
      };
      for (const key of ['onboarding', 'onboardingExtended']) {
        if (!fl[key]) continue;
        fl[key].forEach((s, i) => {
          const b = src[key][i];
          if (!b) return;
          cmp(`${key}[${i}].title`, s.title, b.title);
          cmp(`${key}[${i}].body`, s.body, b.body);
        });
      }
      if (fl.rules)
        for (const [k, r] of Object.entries(fl.rules)) if (src.rules[k]) cmp(`rules.${k}`, r.rule, src.rules[k].rule);
      if (fl.checklist)
        fl.checklist.forEach((s, i) =>
          s.items.forEach((it, j) => {
            const b = src.checklist[i]?.items?.[j];
            if (b !== undefined) cmp(`checklist[${i}].items[${j}]`, it, b);
          }),
        );
      if (problems.length) {
        structural++;
        console.log(`✗ resident ${lang}/${iso}: ${problems.join('; ')}`);
      }
    }
  }
}

if (cells === 0) console.log('ℹ Resident-celler: inga källor (src/content-resident/ saknas eller tom)');
else if (stale === 0 && structural === 0) console.log(`✅ Resident-staleness: ${cells} celler, 0 stale, 0 strukturfel`);
else console.log(`⚠ Resident-staleness: ${cells} celler, ${stale} stale, ${structural} med strukturfel`);
process.exit(0);
