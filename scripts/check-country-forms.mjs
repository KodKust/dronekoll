#!/usr/bin/env node
/**
 * Validerar data/{lang}-country-forms.json — körs FÖRE commit av ett nytt språk.
 *
 * Formtabellerna skrivs för hand eller genereras, och båda vägarna kan producera
 * former som ser rimliga ut men är fel. De två billigaste kontrollerna fångar det
 * mesta:
 *
 *  1. KOMPLETTHET — varje ISO som har ett landsnamn på språket måste ha en form.
 *     Saknas en faller countryParams tillbaka på nominativen och sidan får exakt
 *     den trasiga grammatik tabellen infördes för att bort ("maassa Suomi").
 *  2. NAMNET FINNS ORDAGRANT i formen. Det avslöjar hallucinerade böjningar —
 *     en LLM som ombeds böja 55 landsnamn hittar förr eller senare på ett namn,
 *     och "in Germanien" ser lika trovärdigt ut som "in Germania" för den som
 *     inte kan språket.
 *  3. PREPOSITIONEN är en känd variant för språket (där språket har prepositioner).
 *
 * Kontroll 2 kan bara vara HÅRD för språk som lämnar namnet oförändrat och bara
 * sätter en preposition framför (fr/it/pt/es/bg/ro). Språk som böjer själva
 * stammen går inte att prefix-matcha: finskans konsonantgradation ändrar ordet
 * inuti sammansättningar ("Uusi-Seelanti" → "Uudessa-Seelannissa", "Iso-Britannia"
 * → "Isossa-Britanniassa"). För dem kontrolleras i stället att formen faktiskt
 * SKILJER sig från nominativen — en oböjd form är alltid fel.
 *
 * Användning:
 *   node scripts/check-country-forms.mjs           # alla tabeller
 *   node scripts/check-country-forms.mjs fr it     # bara vissa språk
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
let failures = 0;
const fail = (m) => { failures++; console.error(`✗ ${m}`); };
const ok = (m) => console.log(`✓ ${m}`);

// Språk som böjer SJÄLVA namnet — för dem gäller "formen ≠ nominativen" i
// stället för namnmatchning (se filhuvudet). 'de' hör hit: artikelländerna
// dativböjs ("in den Vereinigten StaatEN" ≠ nominativ "Vereinigte Staaten",
// "in den NiederlandEN") så prefix-matchning mot nominativen är omöjlig.
const INFLECTS_NAME = new Set(['fi', 'et', 'hu', 'tr', 'lt', 'lv', 'cs', 'sk', 'pl', 'sl', 'hr', 'uk', 'is', 'el', 'de']);

// Kända prepositioner/artikelkontraktioner per språk. Saknas språket hoppas kontrollen.
const PREPOSITIONS = {
  fr: ['en', 'au', 'aux', 'à', "à l'"],
  it: ['in', 'a', 'nel', 'nei', 'negli', 'nella', 'nelle', "nell'"],
  pt: ['em', 'no', 'na', 'nos', 'nas'],
  es: ['en'],
  bg: ['в', 'във'],
  ro: ['în'],
  nl: ['in', 'op'], // ö-stater tar 'op' (op Malta, op IJsland, op de Filipijnen)
  de: ['in', 'im', 'auf'], // ö-stater tar 'auf' (auf Malta, auf den Philippinen)
};

function loadNames(lang) {
  const m = JSON.parse(readFileSync(join(ROOT, 'data', 'slugs-matrix.json'), 'utf8'));
  const s = JSON.parse(readFileSync(join(ROOT, 'data', 'slugs.json'), 'utf8'));
  let countries = null;
  for (const d of ['data/live', 'data/snapshots']) {
    const p = join(ROOT, d, 'countries.json');
    if (existsSync(p)) { countries = JSON.parse(readFileSync(p, 'utf8')); break; }
  }
  const nativeLang = {};
  for (const c of countries?.countries ?? []) {
    if (c.isoCode) nativeLang[c.isoCode.toUpperCase()] = c.languageCode;
  }
  const out = {};
  for (const [iso, cell] of Object.entries(m)) {
    if (!iso.startsWith('_') && cell[lang]?.name) out[iso] = cell[lang].name;
  }
  // Länder där språket ÄR modersmålet ligger i slugs.json, inte i matrisen
  // (fr → FR och LU; it → IT). Missas de blir tabellen tyst ofullständig.
  for (const [iso, e] of Object.entries(s)) {
    if (!iso.startsWith('_') && nativeLang[iso] === lang && e.local?.name) out[iso] = e.local.name;
  }
  return out;
}

const args = process.argv.slice(2);
const files = readdirSync(join(ROOT, 'data'))
  .filter((f) => f.endsWith('-country-forms.json'))
  .filter((f) => !args.length || args.includes(f.replace('-country-forms.json', '')));

if (!files.length) { console.error('Inga tabeller att kontrollera.'); process.exit(1); }

for (const file of files.sort()) {
  const lang = file.replace('-country-forms.json', '');
  const forms = JSON.parse(readFileSync(join(ROOT, 'data', file), 'utf8'));
  const names = loadNames(lang);
  const isos = Object.keys(forms).filter((k) => !k.startsWith('_'));

  const missing = Object.keys(names).filter((i) => !forms[i]?.in?.trim());
  const extra = isos.filter((i) => !names[i]);
  if (missing.length) fail(`${lang}: saknar form för ${missing.join(', ')}`);
  if (extra.length) fail(`${lang}: form för okänt land ${extra.join(', ')}`);

  const inflects = INFLECTS_NAME.has(lang);
  const wrong = [];
  for (const iso of isos) {
    const name = names[iso];
    if (!name) continue;
    const form = forms[iso].in;
    if (inflects) {
      // Böjande språk: formen MÅSTE skilja sig från nominativen — om den inte
      // är explicit markerad som oböjlig. Indeklinabla lånord finns på riktigt
      // (lt/lv "Peru", "Čile"), och utan preposition blir de identiska med
      // nominativen. Flaggan tvingar fram ett medvetet beslut i stället för att
      // vakten tystas generellt.
      if (form.trim() === name.trim() && !forms[iso].indeclinable) {
        wrong.push(`${iso} "${form}" är oböjd (sätt "indeclinable": true om det stämmer)`);
      }
    } else if (!form.toLowerCase().includes(name.toLowerCase())) {
      // Skiftlägesokänsligt: artikelsammansmältning kan ändra initialen
      // (mt "Il-Brażil" -> "fil-Brażil"), och källdatan är inte konsekvent i
      // versalisering av artikeln.
      wrong.push(`${iso} "${form}" saknar "${name}"`);
    }
  }
  if (wrong.length)
    fail(`${lang}: ${inflects ? 'oböjda former' : 'landsnamnet saknas i formen'} — ${wrong.slice(0, 4).join(' · ')}`);

  const preps = PREPOSITIONS[lang];
  if (preps) {
    const bad = isos.filter((i) => !preps.some((p) => forms[i].in.startsWith(`${p} `) || forms[i].in.startsWith(p.endsWith("'") ? p : `${p} `)));
    if (bad.length) fail(`${lang}: okänd preposition i ${bad.slice(0, 4).map((i) => `${i} "${forms[i].in}"`).join(' · ')}`);
  }

  if (!missing.length && !extra.length && !wrong.length) {
    ok(
      `${lang}: ${isos.length}/${Object.keys(names).length} former · ` +
        `${inflects ? 'alla böjda' : 'namn verifierade'}${preps ? ' · prepositioner kända' : ''}`,
    );
  }
}

console.log(failures === 0 ? '\nFormtabeller GRÖNA.' : `\n${failures} fel.`);
process.exit(failures === 0 ? 0 : 1);
