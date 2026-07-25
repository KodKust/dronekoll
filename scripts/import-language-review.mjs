#!/usr/bin/env node
/**
 * Läser tillbaka en granskad chrome-strängfil (export-language-review.mjs) och
 * skriver rättelserna till data/web-strings/web_strings.json respektive
 * data/feature-strings.json.
 *
 * Vägrar hellre än gissar. Den farligaste skadan här är inte en dålig
 * formulering utan en TAPPAD PLATSHÅLLARE: försvinner {country} renderas en
 * halv mening, och det syns på alla 55 landssidor i det språket samtidigt.
 * Därför är platshållarparitet ett hårt fel, aldrig en varning.
 *
 *   node scripts/import-language-review.mjs fi.granskad.json          # torrkörning
 *   node scripts/import-language-review.mjs fi.granskad.json --apply
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const apply = args.includes('--apply');
if (!file) {
  console.error('Ange den granskade filen: node scripts/import-language-review.mjs <fil> [--apply]');
  process.exit(2);
}

const FILES = ['data/web-strings/web_strings.json', 'data/feature-strings.json']
  .map((rel) => ({ rel, p: join(ROOT, rel) }))
  .filter((f) => existsSync(f.p))
  .map((f) => ({ ...f, data: JSON.parse(readFileSync(f.p, 'utf8')) }));

// Samma kasus-alias som verify-build/check-web-strings: countryIn och countryGen
// är böjda former av {country}, inte nya variabler.
const CASE_ALIASES = { countryIn: 'country', countryGen: 'country' };
const ph = (s) => new Set([...String(s).matchAll(/\{(\w+)\}/g)].map((m) => CASE_ALIASES[m[1]] ?? m[1]));

const review = JSON.parse(readFileSync(file, 'utf8'));
const lang = review.lang;
if (!lang) { console.error('Filen saknar "lang".'); process.exit(2); }

const errors = [];
const changes = [];

for (const it of review.items ?? []) {
  const fixed = String(it.fixed ?? '').trim();
  if (!fixed) continue;                       // tomt = inget fel hittat
  if (fixed === String(it.current).trim()) continue;  // identisk = ingen ändring

  const owner = FILES.find((f) => f.data[it.key]);
  if (!owner) { errors.push(`${it.key}: okänd nyckel`); continue; }
  if (!owner.data[it.key][lang]) { errors.push(`${it.key}: språket ${lang} finns inte på nyckeln`); continue; }

  const want = ph(owner.data[it.key].en ?? it.en);
  const got = ph(fixed);
  const lost = [...want].filter((x) => !got.has(x));
  const extra = [...got].filter((x) => !want.has(x));
  if (lost.length) errors.push(`${it.key}: platshållare borta → {${lost.join('}, {')}}`);
  if (extra.length) errors.push(`${it.key}: okänd platshållare tillagd → {${extra.join('}, {')}}`);

  changes.push({ key: it.key, owner, from: owner.data[it.key][lang], to: fixed, why: it.why ?? '' });
}

console.log(`Granskning: ${(review.items ?? []).length} strängar, ${changes.length} rättelse(r) för "${lang}"`);
for (const c of changes.slice(0, 30)) {
  console.log(`\n  ${c.key}${c.why ? `  — ${c.why}` : ''}`);
  console.log(`    FÖRE:  ${c.from}`);
  console.log(`    EFTER: ${c.to}`);
}
if (changes.length > 30) console.log(`\n  … och ${changes.length - 30} till`);

if (errors.length) {
  console.log(`\n✗ ${errors.length} FEL — inget skrivs:`);
  for (const e of errors) console.log('   ' + e);
  process.exit(1);
}
if (!changes.length) { console.log('\nInget att skriva.'); process.exit(0); }
if (!apply) { console.log('\n✓ Validering GRÖN (torrkörning). Kör om med --apply för att skriva.'); process.exit(0); }

for (const c of changes) c.owner.data[c.key][lang] = c.to;
for (const f of FILES) writeFileSync(f.p, JSON.stringify(f.data, null, 2) + '\n');
console.log(`\n✓ ${changes.length} strängar uppdaterade. Kör nu: npx astro build && node scripts/verify-build.mjs`);
