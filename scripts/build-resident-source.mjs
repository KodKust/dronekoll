#!/usr/bin/env node
/**
 * Bygger översättningskällan för RESIDENT-celler (CH fr/it, 2026-10-22):
 * data/_resident_todo/{ISO}.json = landets native-innehåll (checklista,
 * onboarding kort + lång, ISO-prefixade zonregler ur airspace_rules.json,
 * länk-id → URL, airspaceMapUrl) + sourceHash som den färdiga filen
 * src/content-resident/{lang}/{ISO}.json ska bära i meta.sourceHash.
 *
 * Hash-receptet SPEGLAR src/lib/resident.ts (residentSourcePayload +
 * residentHash) — KORSREFERERA vid ändring. check-resident-staleness.mjs
 * använder samma recept.
 *
 * Kör: node scripts/build-resident-source.mjs CH [LI …]
 *      node scripts/build-resident-source.mjs --hash CH   (skriv bara hashen)
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

function loadData(name) {
  for (const rel of [`data/live/${name}`, `data/snapshots/${name}`]) {
    const p = join(ROOT, rel);
    if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
  }
  throw new Error(`${name} saknas — kör npm run fetch-data`);
}

/** Python json.dumps(sort_keys=True, separators=(",",":")) — samma kanon som
 *  resident.ts canonical(). */
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  if (value === undefined) return 'null';
  return JSON.stringify(value);
}

/** Spegel av resident.ts residentSourcePayload(). */
export function residentSource(country, rulesFile) {
  const iso = country.isoCode.toUpperCase();
  const slide = (s) => ({
    title: s.title ?? '',
    body: s.body ?? '',
    ...(typeof s.tag === 'string' ? { tag: s.tag } : {}),
  });
  const rules = {};
  const zones = rulesFile?.zones ?? {};
  for (const key of Object.keys(zones).sort()) {
    if (!key.toUpperCase().startsWith(`${iso}:`)) continue;
    const type = key.slice(key.indexOf(':') + 1).toUpperCase();
    rules[type] = { rule: zones[key].rule ?? '', source: zones[key].source ?? '' };
  }
  const links = {};
  for (const l of [...(country.primaryLinks ?? []), ...(country.secondaryLinks ?? [])]) {
    if (l.id && l.url) links[l.id] = l.url;
  }
  return {
    checklist: (country.checklist ?? []).map((s) => ({ title: s.title ?? '', items: s.items ?? [] })),
    onboarding: (country.onboarding ?? []).map(slide),
    onboardingExtended: (country.onboardingExtended ?? []).map(slide),
    rules,
    links,
    airspaceMapUrl: country.airspaceMapUrl ?? '',
  };
}

export const residentHash = (payload) =>
  createHash('sha256').update(canonical(payload), 'utf8').digest('hex').slice(0, 32);

export function expectedResidentHashFor(iso) {
  const countries = loadData('countries.json');
  const rules = loadData('airspace_rules.json');
  const country = countries.countries.find((c) => c.isoCode?.toUpperCase() === iso.toUpperCase());
  if (!country) return null;
  return residentHash(residentSource(country, rules));
}

const argv = process.argv.slice(2);
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const hashOnly = argv.includes('--hash');
  const isos = argv.filter((a) => !a.startsWith('--')).map((a) => a.toUpperCase());
  if (isos.length === 0) {
    console.error('Ange minst ett ISO: node scripts/build-resident-source.mjs CH');
    process.exit(1);
  }
  const countries = loadData('countries.json');
  const rules = loadData('airspace_rules.json');
  const outDir = join(ROOT, 'data', '_resident_todo');
  for (const iso of isos) {
    const country = countries.countries.find((c) => c.isoCode?.toUpperCase() === iso);
    if (!country) {
      console.error(`✗ ${iso}: finns inte i countries.json`);
      process.exitCode = 1;
      continue;
    }
    const payload = residentSource(country, rules);
    const sourceHash = residentHash(payload);
    if (hashOnly) {
      console.log(`${iso} ${sourceHash}`);
      continue;
    }
    mkdirSync(outDir, { recursive: true });
    const out = {
      sourceHash,
      sourceLang: country.languageCode,
      sourceCountriesVersion: countries.version,
      sourceRulesVersion: rules.version ?? null,
      fields: payload,
    };
    writeFileSync(join(outDir, `${iso}.json`), JSON.stringify(out, null, 1));
    const n = {
      checklist: payload.checklist.length,
      onboarding: payload.onboarding.length,
      onboardingExtended: payload.onboardingExtended.length,
      rules: Object.keys(payload.rules).length,
      links: Object.keys(payload.links).length,
    };
    console.log(`✓ data/_resident_todo/${iso}.json (${country.languageCode}) hash ${sourceHash} — ${JSON.stringify(n)}`);
  }
}
