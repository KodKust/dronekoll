#!/usr/bin/env node
/**
 * Läser tillbaka en ifylld jobbfil (se export-translation-job.mjs) och skriver
 * in översättningarna i src/content/{lang}/{ISO}.json.
 *
 * VALIDERAR FÖRE SKRIVNING — och vägrar hellre än gissar. Innehållet är
 * YMYL (säkerhet/juridik): en extern översättare kan råka "förbättra" en siffra
 * eller släppa ett myndighetsnamn, och det får aldrig nå en pilot. Kontroller:
 *   1. Struktur: kända id:n, inget tomt, rätt språk, inga tillagda poster.
 *   2. Tal + enheter: varje mätvärde i källan ska finnas i översättningen.
 *      Tusentalsavgränsare och decimaltecken normaliseras (2,500 = 2 500),
 *      men VÄRDET måste stämma.
 *   3. Skyddade termer: förkortningar och egennamn ur källan ska stå kvar.
 *   4. Oöversatt: identisk med engelskan → varning (kan vara legitimt för
 *      korta egennamnsrader, men ska synas).
 * Fel → inget skrivs alls. Varningar → skrivs, men listas.
 *
 *   node scripts/import-translation-job.mjs ifylld.json --engine gpt-5
 *   node scripts/import-translation-job.mjs ifylld.json --engine gpt-5 --apply
 *
 * Utan --apply är det en torrkörning (rapport, inga filändringar).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const CONTENT = join(ROOT, 'src', 'content');
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const apply = args.includes('--apply');
const engine = args.includes('--engine') ? args[args.indexOf('--engine') + 1] : 'manual';
const today = new Date().toISOString().slice(0, 10);

if (!file) {
  console.error('Ange den ifyllda jobbfilen: node scripts/import-translation-job.mjs <fil> [--apply]');
  process.exit(2);
}

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

function expectedHash(iso) {
  const p = join(CONTENT, 'en', `${iso}.json`);
  if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8')).meta?.sourceHash ?? null;
  const c = byIso.get(iso);
  return c ? matrixHash(fieldsFromCountry(c)) : null;
}

/** Mätvärden: tal + enhet. Normaliserar 2,500 / 2 500 / 2.500 → 2500. */
const NUM_UNIT = /(\d[\d., \s]*)\s*(kg|g\b|km|m\b|ft|NM|J\b|%|SGD|HK\$|€|£|\$|R\b|år|years?|months?|min)/gi;
const norm = (s) => s.replace(/[\s .,]/g, '');
function measures(text) {
  const out = new Set();
  for (const m of String(text).matchAll(NUM_UNIT)) out.add(`${norm(m[1])}${m[2].toLowerCase()}`);
  return out;
}

/** Skyddade termer: versala förkortningar (≥2 tecken) och kända egennamn. */
const PROTECTED = /\b(EASA|FAA|CAA|CAAP|CAAS|CAD|DGCA|SACAA|SANParks|NATS|GCAA|DCAA|NOTAM|VLOS|BVLOS|EVLOS|FPV|MTOM|B-RID|RPC|UAPL|FRIA|FRZ|RFZ|CTR|NEMA|DigitalSky|NAV DRONE|Transport Canada|Parks Canada|Marine Mammals Protection Regulations|PCAR|FlyItSafe|My Drone Hub|HKIA|NAIA|SISANT|UIN|DOC|eVTOL|Part \d+|A1\/A3|A2|R1\d\d)\b/g;
const protectedTerms = (t) => new Set(String(t).match(PROTECTED) ?? []);

const job = JSON.parse(readFileSync(file, 'utf8'));
const items = job.items ?? [];
const errors = [];
const warnings = [];
const byCell = new Map(); // "lang/ISO" → [{key, idx, tr}]

for (const it of items) {
  const [lang, iso, key, idxRaw] = String(it.id ?? '').split('|');
  if (!lang || !iso || !key) { errors.push(`Okänt id: ${it.id}`); continue; }
  if (job.lang && lang !== job.lang) { errors.push(`${it.id}: språket avviker från filens "lang" (${job.lang})`); continue; }
  if (!existsSync(join(CONTENT, lang, `${iso}.json`))) { errors.push(`${it.id}: ingen cell ${lang}/${iso}.json`); continue; }
  const tr = String(it.tr ?? '').trim();
  if (!tr) { errors.push(`${it.id}: tom översättning`); continue; }

  const miss = [...measures(it.en)].filter((m) => !measures(tr).has(m));
  if (miss.length) errors.push(`${it.id}: mätvärde saknas eller ändrat → ${miss.join(', ')}`);

  const lostTerms = [...protectedTerms(it.en)].filter((t) => !tr.includes(t));
  if (lostTerms.length) errors.push(`${it.id}: skyddad term borta → ${lostTerms.join(', ')}`);

  if (tr === String(it.en).trim() && tr.length > 40) warnings.push(`${it.id}: identisk med engelskan (oöversatt?)`);
  if (tr.length > String(it.en).length * 2.2) warnings.push(`${it.id}: ovanligt lång (${tr.length} mot ${String(it.en).length})`);

  const k = `${lang}/${iso}`;
  if (!byCell.has(k)) byCell.set(k, []);
  byCell.get(k).push({ key, idx: idxRaw === '-' ? null : Number(idxRaw), tr });
}

console.log(`Jobb: ${items.length} poster, ${byCell.size} celler, motor "${engine}"`);
if (warnings.length) {
  console.log(`\n⚠ ${warnings.length} varning(ar):`);
  for (const w of warnings.slice(0, 25)) console.log('   ' + w);
  if (warnings.length > 25) console.log(`   … och ${warnings.length - 25} till`);
}
if (errors.length) {
  console.log(`\n✗ ${errors.length} FEL — inget skrivs:`);
  for (const e of errors.slice(0, 40)) console.log('   ' + e);
  if (errors.length > 40) console.log(`   … och ${errors.length - 40} till`);
  process.exit(1);
}

if (!apply) {
  console.log('\n✓ Validering GRÖN (torrkörning). Kör om med --apply för att skriva.');
  process.exit(0);
}

let written = 0;
for (const [k, rows] of byCell) {
  const [lang, iso] = k.split('/');
  const p = join(CONTENT, lang, `${iso}.json`);
  const cell = JSON.parse(readFileSync(p, 'utf8'));
  for (const r of rows) {
    if (r.idx === null) cell.fields[r.key] = r.tr;
    else {
      const arr = (cell.fields[r.key] ??= []);
      arr[r.idx] = r.tr;
    }
  }
  // Strukturvakt: radantalet måste matcha källan efter skrivning
  const src = existsSync(join(CONTENT, 'en', `${iso}.json`))
    ? JSON.parse(readFileSync(join(CONTENT, 'en', `${iso}.json`), 'utf8')).fields
    : fieldsFromCountry(byIso.get(iso));
  for (const key of LIST_FIELDS) {
    const want = (src[key] ?? []).length;
    const got = (cell.fields[key] ?? []).length;
    if (want !== got) {
      console.error(`✗ ${k}.${key}: ${got} rader mot källans ${want} — avbryter utan att skriva mer`);
      process.exit(1);
    }
  }
  const h = expectedHash(iso);
  if (h) cell.meta.sourceHash = h;
  cell.meta.engine = engine;
  cell.meta.translatedAt = today;
  writeFileSync(p, JSON.stringify(cell, null, 2) + '\n');
  written++;
}
console.log(`\n✓ ${written} celler skrivna. Kör nu: npx astro build && node scripts/verify-build.mjs`);
