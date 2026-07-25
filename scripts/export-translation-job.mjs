#!/usr/bin/env node
/**
 * Exporterar ett översättningsjobb som EN fil per språk, avsedd att skickas
 * till en extern översättare (ChatGPT eller annan) och komma tillbaka ifylld.
 *
 * Varför en egen exportväg: översättningsarbetet behöver inte göras här. Det
 * som MÅSTE göras här är att kontrollera det som kommer tillbaka — därför är
 * export/import ett par, och importern (import-translation-job.mjs) släpper
 * bara igenom filer vars fakta är intakta.
 *
 * Filen innehåller instruktionen överst, så den som klistrar in den i ett
 * chattfönster inte behöver bifoga något mer.
 *
 *   node scripts/export-translation-job.mjs            # bara stale celler
 *   node scripts/export-translation-job.mjs --lang fr  # ett språk
 *   node scripts/export-translation-job.mjs --all      # allt, inte bara stale
 *
 * Ut: data/_outsourced/{lang}.job.json
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'data', '_outsourced');
const CONTENT = join(ROOT, 'src', 'content');

const args = process.argv.slice(2);
const onlyLang = args.includes('--lang') ? args[args.indexOf('--lang') + 1] : null;
const includeFresh = args.includes('--all');

const STRING_FIELDS = [
  'disclaimerText', 'sectionLabelRules', 'sectionLabelPrimary',
  'sectionLabelSecondary', 'linksSheetTitle', 'dronePilotCredentialName',
];
const LIST_FIELDS = ['keyRules', 'importantNotes'];

const countries = JSON.parse(
  readFileSync(
    existsSync(join(ROOT, 'data/live/countries.json'))
      ? join(ROOT, 'data/live/countries.json')
      : join(ROOT, 'data/snapshots/countries.json'),
    'utf8',
  ),
).countries;
const byIso = new Map(countries.filter((c) => c.isoCode !== 'OTHER').map((c) => [c.isoCode, c]));

function fieldsFromCountry(c) {
  const f = {};
  for (const k of STRING_FIELDS) if (c[k]) f[k] = c[k];
  for (const k of LIST_FIELDS) f[k] = c[k] ?? [];
  f.primaryLinks = (c.primaryLinks ?? []).map((l) => ({ title: l.title ?? '', description: l.description ?? '' }));
  f.secondaryLinks = (c.secondaryLinks ?? []).map((l) => ({ title: l.title ?? '', description: l.description ?? '' }));
  return f;
}
const matrixHash = (o) => createHash('sha256').update(JSON.stringify(o), 'utf8').digest('hex').slice(0, 32);

/** Engelsk källtext för ett land: EN-overlay om det finns, annars countries.json. */
function englishFields(iso) {
  const p = join(CONTENT, 'en', `${iso}.json`);
  if (existsSync(p)) {
    const en = JSON.parse(readFileSync(p, 'utf8'));
    return { fields: en.fields, hash: en.meta?.sourceHash ?? null };
  }
  const c = byIso.get(iso);
  if (!c) return null;
  const f = fieldsFromCountry(c);
  return { fields: f, hash: matrixHash(f) };
}

const INSTRUCTION = [
  'Du översätter drönarregler för dronekoll.com från ENGELSKA till målspråket i "lang".',
  '',
  'SÄKERHETS- OCH JURIDIKINNEHÅLL. Ändra ALDRIG sakuppgifter: siffror, vikter (250 g),',
  'höjder (120 m), avstånd, åldersgränser, belopp, datum eller myndighetsnamn.',
  'Översätt troget — det här är en kunskapsbank, inte marknadsföring.',
  '',
  'BEHÅLL ORDAGRANT (översätt aldrig): EASA, FAA, CAA, CAAP, CAAS, CAD, DGCA, SACAA,',
  'SANParks, NATS, NOTAM, VLOS, BVLOS, EVLOS, FPV, MTOM, B-RID, Remote ID, Part 101,',
  'Part 102, Part 107, PCAR, RPC, UAPL, FRIA, FRZ, RFZ, CTR, NEMA, DigitalSky, NAV DRONE,',
  'samt namn på myndigheter, lagar, appar och orter.',
  '',
  'FORMAT: fyll i "tr" för varje post. Rör inte "id" eller "en". Lämna ingen post tom.',
  'Behåll samma meningsinnehåll och ungefär samma längd. Sentence case, naturligt',
  'språk — som en kunnig lokal drönarpilot förklarar för en annan, inga',
  'maskinöversatta stelheter.',
  '',
  'Tusentalsavgränsare och decimaltecken får följa målspråkets skrivsätt',
  '(2,500 ft → 2 500 ft), men VÄRDET måste vara identiskt.',
  '',
  'Returnera SAMMA JSON-struktur, ifylld. Ingen extra text runt omkring.',
].join('\n');

const langs = onlyLang
  ? [onlyLang]
  : readdirSync(CONTENT).filter((d) => d !== 'en' && d !== 'faq-overrides'
      && existsSync(join(CONTENT, d)) && readdirSync(join(CONTENT, d)).some((f) => f.endsWith('.json')));

mkdirSync(OUT, { recursive: true });
let totalItems = 0;
const summary = {};

for (const lang of langs) {
  const dir = join(CONTENT, lang);
  const items = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json') && !x.startsWith('_'))) {
    const iso = f.replace(/\.json$/, '');
    const cell = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const en = englishFields(iso);
    if (!en) continue;
    const isStale = en.hash !== null && cell.meta?.sourceHash !== en.hash;
    if (!isStale && !includeFresh) continue;

    for (const key of LIST_FIELDS) {
      const srcArr = en.fields[key] ?? [];
      const curArr = cell.fields?.[key] ?? [];
      for (let i = 0; i < srcArr.length; i++) {
        // Bara rader vars ENGELSKA text ändrats sedan cellen översattes är
        // intressanta — men vi kan inte veta vilken engelska cellen såg, så
        // vi skickar hela fältet när cellen är stale. Den som fyller i kan
        // återanvända "current" oförändrad där inget behöver ändras.
        items.push({
          id: `${lang}|${iso}|${key}|${i}`,
          en: srcArr[i],
          current: curArr[i] ?? null,
          tr: '',
        });
      }
    }
    for (const key of STRING_FIELDS) {
      if (!en.fields[key]) continue;
      items.push({
        id: `${lang}|${iso}|${key}|-`,
        en: en.fields[key],
        current: cell.fields?.[key] ?? null,
        tr: '',
      });
    }
  }
  if (!items.length) continue;
  writeFileSync(
    join(OUT, `${lang}.job.json`),
    JSON.stringify({ instruction: INSTRUCTION, lang, items }, null, 2) + '\n',
  );
  summary[lang] = items.length;
  totalItems += items.length;
}

console.log(`✓ ${Object.keys(summary).length} jobbfiler i data/_outsourced/ — ${totalItems} poster`);
console.log(JSON.stringify(summary));
