#!/usr/bin/env node
/**
 * data/slugs-matrix.json — lokaliserade slugs + visningsnamn för matrisens
 * "övriga" celler (varje land × språk UTOM en och landets eget språk, som bor
 * i data/slugs.json/frozen).
 *
 * Namn: Intl.DisplayNames(lang, region) — Node/ICU täcker alla 27 språk.
 * Slug: latinska språk → translittererad slugify av det lokala namnet;
 *       icke-latinska målspråk (bg/el/uk) → engelska sluggen (URL:er ASCII,
 *       innehåll+titel bär språket ändå). Deterministiskt, append-only-fryst.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const LANGS = [
  'bg', 'cs', 'da', 'de', 'el', 'es', 'et', 'fi', 'fr', 'hr', 'hu', 'is', 'it',
  'lt', 'lv', 'mt', 'nl', 'no', 'pl', 'pt', 'ro', 'sk', 'sl', 'sv', 'tr', 'uk',
]; // alla 26 UTOM en
const NON_LATIN = new Set(['bg', 'el', 'uk']);

const countriesFile = existsSync(join(ROOT, 'data/live/countries.json'))
  ? JSON.parse(readFileSync(join(ROOT, 'data/live/countries.json'), 'utf8'))
  : JSON.parse(readFileSync(join(ROOT, 'data/snapshots/countries.json'), 'utf8'));
const slugs = JSON.parse(readFileSync(join(ROOT, 'data', 'slugs.json'), 'utf8'));

function slugify(s) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ŁL]/g, (m) => (m === 'Ł' ? 'L' : 'L')).replace(/ł/g, 'l')
    .replace(/đ/gi, 'd').replace(/ø/gi, 'o').replace(/þ/gi, 'th')
    .replace(/ß/g, 'ss').replace(/æ/gi, 'ae').replace(/œ/gi, 'oe').replace(/ð/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const dn = {};
for (const l of LANGS) dn[l] = new Intl.DisplayNames([l], { type: 'region' });

const out = {};
const collisions = [];

for (const c of countriesFile.countries) {
  if (c.isoCode === 'OTHER') continue;
  const iso = c.isoCode.toUpperCase();
  const s = slugs[iso];
  if (!s || typeof s === 'string') continue;
  const enSlug = s.en.slug;
  out[iso] = {};
  for (const lang of LANGS) {
    if (lang === c.languageCode) continue; // native → slugs.json.local
    const name = dn[lang].of(iso) || s.en.name;
    let slug;
    if (NON_LATIN.has(lang)) {
      slug = enSlug; // ASCII-URL, namnet bär skriften
    } else {
      slug = slugify(name) || enSlug;
    }
    out[iso][lang] = { slug, name };
  }
}

// Kollisionsvakt per språk (två länder → samma slug i samma språk)
for (const lang of LANGS) {
  const seen = new Map();
  for (const [iso, byLang] of Object.entries(out)) {
    const e = byLang[lang];
    if (!e) continue;
    if (seen.has(e.slug)) collisions.push(`${lang}: ${e.slug} (${seen.get(e.slug)} + ${iso})`);
    else seen.set(e.slug, iso);
  }
}

writeFileSync(
  join(ROOT, 'data', 'slugs-matrix.json'),
  JSON.stringify({ _generated: 'scripts/build-slug-matrix.mjs — Intl.DisplayNames', ...out }, null, 1),
);
console.log(`✓ slugs-matrix.json: ${Object.keys(out).length} länder × ${LANGS.length} språk`);
if (collisions.length) {
  console.error(`⚠ ${collisions.length} slug-kollisioner:`);
  collisions.forEach((c) => console.error('  ' + c));
  process.exit(1);
}
console.log('Inga slug-kollisioner.');
