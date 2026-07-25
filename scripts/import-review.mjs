#!/usr/bin/env node
/**
 * Läser tillbaka granskade filer från export-review.mjs och skriver in det som
 * håller. Tar en fil eller en hel mapp (rekursivt — peka på hela
 * ~/Desktop/Språkgranskning så betas allt av).
 *
 * VÄGRAR HELLRE ÄN GISSAR. Innehållet är säkerhets- och juridikinformation som
 * piloter läser innan de flyger, och granskaren är en modell utan ansvar för
 * följderna. Hårda fel (inget skrivs för den posten):
 *   · tappad eller tillagd platshållare — {country} som försvinner ur en mall
 *     ger en halv mening på alla 55 landssidor i språket samtidigt
 *   · ändrat eller borttappat mätvärde — 250 g, 2 500 ft, 50 000 SGD
 *   · borttappad skyddad term — EASA, VLOS, Part 107, SANParks …
 *   · okänt id, fel språk, tom text
 * Varningar (skrivs, men listas): identisk med engelskan, ovanligt lång.
 *
 *   node scripts/import-review.mjs ~/Desktop/Språkgranskning            # torrkör allt
 *   node scripts/import-review.mjs ~/Desktop/Språkgranskning --apply
 *   node scripts/import-review.mjs 01-tyska-de/2-regler-A-klar.json --apply
 */
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const CONTENT = join(ROOT, 'src', 'content');
const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--'));
const apply = args.includes('--apply');
const engine = args.includes('--engine') ? args[args.indexOf('--engine') + 1] : 'gpt-5';
const today = new Date().toISOString().slice(0, 10);
if (!target) {
  console.error('Ange fil eller mapp: node scripts/import-review.mjs <sökväg> [--apply]');
  process.exit(2);
}

const STRING_FIELDS = [
  'disclaimerText', 'sectionLabelRules', 'sectionLabelPrimary',
  'sectionLabelSecondary', 'linksSheetTitle', 'dronePilotCredentialName',
];
const LIST_FIELDS = ['keyRules', 'importantNotes'];

const chromeFiles = ['data/web-strings/web_strings.json', 'data/feature-strings.json']
  .map((rel) => ({ rel, p: join(ROOT, rel) }))
  .filter((f) => existsSync(f.p))
  .map((f) => ({ ...f, data: JSON.parse(readFileSync(f.p, 'utf8')) }));

const countries = JSON.parse(
  readFileSync(existsSync(join(ROOT, 'data/live/countries.json'))
    ? join(ROOT, 'data/live/countries.json')
    : join(ROOT, 'data/snapshots/countries.json'), 'utf8'),
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

const CASE_ALIASES = { countryIn: 'country', countryGen: 'country' };
const ph = (s) => new Set([...String(s).matchAll(/\{(\w+)\}/g)].map((m) => CASE_ALIASES[m[1]] ?? m[1]));
const NUM_UNIT = /(\d[\d., \s]*)\s*(kg|g\b|km|m\b|ft|NM|J\b|%|SGD|HK\$|€|£|\$)/gi;
const norm = (s) => s.replace(/[\s.,]/g, '');
function measures(t) {
  const out = new Set();
  for (const m of String(t).matchAll(NUM_UNIT)) out.add(`${norm(m[1])}${m[2].toLowerCase()}`);
  return out;
}
const PROTECTED = /\b(EASA|FAA|CAA|CAAP|CAAS|CAD|DGCA|SACAA|SANParks|NATS|GCAA|DCAA|Traficom|NOTAM|VLOS|BVLOS|EVLOS|FPV|MTOM|B-RID|RPC|UAPL|FRIA|FRZ|RFZ|CTR|NEMA|DigitalSky|PCAR|FlyItSafe|HKIA|NAIA|SISANT|UIN|eVTOL|Part \d+)\b/g;
const terms = (t) => new Set(String(t).match(PROTECTED) ?? []);

function collect(p) {
  if (lstatSync(p).isDirectory()) {
    return readdirSync(p).flatMap((f) => collect(join(p, f)));
  }
  return p.endsWith('.json') ? [p] : [];
}

const files = collect(target);
const errors = [];
const warnings = [];
const chromeChanges = [];
const cellChanges = new Map(); // "lang/ISO" → [{key, idx, text}]
let considered = 0;

for (const f of files) {
  let job;
  try { job = JSON.parse(readFileSync(f, 'utf8')); } catch { errors.push(`${f}: ogiltig JSON`); continue; }
  const lang = job.lang;
  if (!lang || !Array.isArray(job.items)) continue;   // inte en jobbfil
  for (const it of job.items) {
    const fixed = String(it.fixed ?? '').trim();
    if (!fixed) continue;
    if (it.current != null && fixed === String(it.current).trim()) continue;
    considered++;
    const where = `${lang} ${it.id}`;

    const want = ph(it.en ?? '');
    const got = ph(fixed);
    const lost = [...want].filter((x) => !got.has(x));
    const extra = [...got].filter((x) => !want.has(x));
    if (lost.length) { errors.push(`${where}: platshållare borta → {${lost.join('}, {')}}`); continue; }
    if (extra.length) { errors.push(`${where}: okänd platshållare → {${extra.join('}, {')}}`); continue; }

    const missM = [...measures(it.en ?? '')].filter((m) => !measures(fixed).has(m));
    if (missM.length) { errors.push(`${where}: mätvärde ändrat/borta → ${missM.join(', ')}`); continue; }
    const missT = [...terms(it.en ?? '')].filter((t) => !fixed.includes(t));
    if (missT.length) { errors.push(`${where}: skyddad term borta → ${missT.join(', ')}`); continue; }

    if (fixed === String(it.en ?? '').trim() && fixed.length > 40) warnings.push(`${where}: identisk med engelskan`);

    const [kind, a, b, c] = String(it.id).split('|');
    if (kind === 'chrome') {
      const owner = chromeFiles.find((x) => x.data[a]);
      if (!owner) { errors.push(`${where}: okänd nyckel ${a}`); continue; }
      if (!owner.data[a][lang]) { errors.push(`${where}: ${lang} saknas på ${a}`); continue; }
      chromeChanges.push({ owner, key: a, lang, from: owner.data[a][lang], to: fixed, why: it.why ?? '' });
    } else if (kind === 'cell') {
      const p = join(CONTENT, lang, `${a}.json`);
      if (!existsSync(p)) { errors.push(`${where}: ingen cell ${lang}/${a}`); continue; }
      const k = `${lang}/${a}`;
      if (!cellChanges.has(k)) cellChanges.set(k, []);
      cellChanges.get(k).push({ key: b, idx: c === '-' ? null : Number(c), text: fixed, why: it.why ?? '', from: it.current });
    } else {
      errors.push(`${where}: okänd id-typ "${kind}"`);
    }
  }
}

console.log(`${files.length} fil(er) lästa · ${considered} föreslagna ändringar`);
console.log(`  webbtexter: ${chromeChanges.length}   regeltexter: ${[...cellChanges.values()].reduce((a, v) => a + v.length, 0)} i ${cellChanges.size} celler`);
if (warnings.length) {
  console.log(`\n⚠ ${warnings.length} varning(ar):`);
  for (const w of warnings.slice(0, 20)) console.log('   ' + w);
  if (warnings.length > 20) console.log(`   … och ${warnings.length - 20} till`);
}
if (errors.length) {
  console.log(`\n✗ ${errors.length} avvisade (skrivs INTE — resten kan fortfarande skrivas):`);
  for (const e of errors.slice(0, 40)) console.log('   ' + e);
  if (errors.length > 40) console.log(`   … och ${errors.length - 40} till`);
}
if (!chromeChanges.length && !cellChanges.size) { console.log('\nInget att skriva.'); process.exit(0); }

if (!apply) {
  console.log('\nExempel på vad som skulle skrivas:');
  for (const c of chromeChanges.slice(0, 5)) {
    console.log(`\n  ${c.key} (${c.lang})${c.why ? `  — ${c.why}` : ''}`);
    console.log(`    FÖRE:  ${String(c.from).slice(0, 150)}`);
    console.log(`    EFTER: ${c.to.slice(0, 150)}`);
  }
  for (const [k, rows] of [...cellChanges].slice(0, 3)) {
    for (const r of rows.slice(0, 2)) {
      console.log(`\n  ${k}.${r.key}[${r.idx ?? '-'}]${r.why ? `  — ${r.why}` : ''}`);
      console.log(`    FÖRE:  ${String(r.from ?? '(saknades)').slice(0, 150)}`);
      console.log(`    EFTER: ${r.text.slice(0, 150)}`);
    }
  }
  console.log('\n✓ Torrkörning klar. Kör om med --apply för att skriva.');
  process.exit(errors.length ? 1 : 0);
}

for (const c of chromeChanges) c.owner.data[c.key][c.lang] = c.to;
for (const f of chromeFiles) writeFileSync(f.p, JSON.stringify(f.data, null, 2) + '\n');

let cells = 0;
for (const [k, rows] of cellChanges) {
  const [lang, iso] = k.split('/');
  const p = join(CONTENT, lang, `${iso}.json`);
  const cell = JSON.parse(readFileSync(p, 'utf8'));
  for (const r of rows) {
    if (r.idx === null) cell.fields[r.key] = r.text;
    else (cell.fields[r.key] ??= [])[r.idx] = r.text;
  }
  const src = existsSync(join(CONTENT, 'en', `${iso}.json`))
    ? JSON.parse(readFileSync(join(CONTENT, 'en', `${iso}.json`), 'utf8')).fields
    : fieldsFromCountry(byIso.get(iso));
  for (const key of LIST_FIELDS) {
    const want = (src[key] ?? []).length;
    const got = (cell.fields[key] ?? []).length;
    if (want !== got) { console.error(`✗ ${k}.${key}: ${got} rader mot källans ${want} — avbryter`); process.exit(1); }
  }
  const h = expectedHash(iso);
  if (h) cell.meta.sourceHash = h;
  cell.meta.engine = engine;
  cell.meta.translatedAt = today;
  writeFileSync(p, JSON.stringify(cell, null, 2) + '\n');
  cells++;
}
console.log(`\n✓ ${chromeChanges.length} webbtexter + ${cells} celler skrivna.`);
console.log('  Kör nu: STRICT_EN=1 ASSERT_PAGES=1 STRICT_L10N=1 npx astro build && node scripts/verify-build.mjs');
