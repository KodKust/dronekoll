#!/usr/bin/env node
/**
 * Exporterar HELA sajtens språkgranskning som en mapp per språk.
 *
 * ETT format för allt (tidigare fanns två: export-language-review för chrome och
 * export-translation-job för regeltexter, med olika fält och olika instruktion).
 * Skillnaden behövdes aldrig: varje post har "en" (engelsk källa), "current"
 * (nuvarande text) och tomma "fixed"/"why". Är current en daterad översättning
 * av en äldre engelsk text skriver granskaren en ny — är den bara språkligt
 * skev rättar hen språket. Samma uppgift, samma instruktion, ett filformat.
 *
 *   node scripts/export-review.mjs --out ~/Desktop/Språkgranskning
 *   node scripts/export-review.mjs --lang de --out /tmp/test
 *
 * Ut: <out>/<NN-språk-kod>/1-webbtexter.json, 2-regler-A.json, …
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const CONTENT = join(ROOT, 'src', 'content');
const args = process.argv.slice(2);
const outRoot = args.includes('--out') ? args[args.indexOf('--out') + 1] : join(ROOT, 'data', '_outsourced');
const onlyLang = args.includes('--lang') ? args[args.indexOf('--lang') + 1] : null;
/** Ungefärligt tecken-tak per fil — en bekväm storlek för ett chattsvar. */
const CHUNK = 22000;

const LANG_NAME = {
  bg: 'bulgariska', cs: 'tjeckiska', da: 'danska', de: 'tyska', el: 'grekiska',
  es: 'spanska', et: 'estniska', fi: 'finska', fr: 'franska', hr: 'kroatiska',
  hu: 'ungerska', is: 'isländska', it: 'italienska', lt: 'litauiska',
  lv: 'lettiska', mt: 'maltesiska', nl: 'nederländska', no: 'norska',
  pl: 'polska', pt: 'portugisiska', ro: 'rumänska', sk: 'slovakiska',
  sl: 'slovenska', sv: 'svenska', tr: 'turkiska', uk: 'ukrainska',
};

// Språk som är modersmål i ett land med zonkarta (luftrumsöverlägg) — Kristoffers
// huvudmarknader. De numreras först så det syns var arbetet ger mest.
const OVERLAY_LANGS = ['de', 'fr', 'nl', 'da', 'no', 'sv', 'fi', 'es', 'pt', 'ro', 'sk', 'sl', 'et', 'is'];
const REST = ['pl', 'it', 'cs', 'hu', 'el', 'lv', 'lt', 'hr', 'bg', 'tr', 'uk', 'mt'];
const ORDER = [...OVERLAY_LANGS, ...REST];

const STRING_FIELDS = [
  'disclaimerText', 'sectionLabelRules', 'sectionLabelPrimary',
  'sectionLabelSecondary', 'linksSheetTitle', 'dronePilotCredentialName',
];
const LIST_FIELDS = ['keyRules', 'importantNotes'];
const SKIP_SEO = /^meta\.(title|desc)\./;

const chrome = {};
for (const rel of ['data/web-strings/web_strings.json', 'data/feature-strings.json']) {
  const p = join(ROOT, rel);
  if (existsSync(p)) Object.assign(chrome, JSON.parse(readFileSync(p, 'utf8')));
}

const countries = JSON.parse(
  readFileSync(existsSync(join(ROOT, 'data/live/countries.json'))
    ? join(ROOT, 'data/live/countries.json')
    : join(ROOT, 'data/snapshots/countries.json'), 'utf8'),
).countries;
const byIso = new Map(countries.filter((c) => c.isoCode !== 'OTHER').map((c) => [c.isoCode, c]));
const nameOf = new Map([...byIso].map(([iso, c]) => [iso, c.name]));

function fieldsFromCountry(c) {
  const f = {};
  for (const k of STRING_FIELDS) if (c[k]) f[k] = c[k];
  for (const k of LIST_FIELDS) f[k] = c[k] ?? [];
  return f;
}
const matrixHash = (o) => createHash('sha256').update(JSON.stringify(o), 'utf8').digest('hex').slice(0, 32);

function englishFor(iso) {
  const p = join(CONTENT, 'en', `${iso}.json`);
  if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8')).fields;
  const c = byIso.get(iso);
  return c ? fieldsFromCountry(c) : null;
}

const INSTRUCTION = (lang) => [
  `Du språkgranskar ${LANG_NAME[lang] ?? lang}n på dronekoll.com — en kunskapsbank om`,
  'drönarregler som piloter läser innan de flyger.',
  '',
  'UPPGIFT: gå igenom varje post och hitta FEL. Stavfel, grammatik, fel kasus eller',
  'numerus, felöversättningar, ord som inte betyder vad de ska, och stelheter som',
  'avslöjar maskinöversättning. Jämför alltid mot "en" — den engelska förlagan.',
  '',
  'Om "current" säger något annat än "en" är det översättningen som ska rättas, inte',
  'engelskan. Ibland är current en äldre översättning av en text som sedan ändrats —',
  'skriv då en ny översättning som motsvarar "en".',
  '',
  'FYLL I "fixed" ENDAST där något faktiskt är fel. Är texten bra: lämna "fixed" tomt.',
  'Skriv INTE om korrekt text bara för att den kan formuleras annorlunda.',
  'Motivera varje rättelse kort i "why" ("partitiv krävs efter räkneord",',
  '"props betyder propellrar, inte vingar").',
  '',
  '=== ÄNDRA ALDRIG SAKUPPGIFTER ===',
  'Siffror, vikter (250 g), höjder (120 m), avstånd (5,5 km), åldersgränser, belopp,',
  'datum och paragrafnummer ska stå kvar EXAKT. Tusentalsavgränsare får följa',
  'målspråkets skrivsätt (2,500 ft → 2 500 ft) men värdet måste vara identiskt.',
  'Det här är säkerhets- och juridikinformation — en ändrad siffra kan få någon att',
  'flyga olagligt.',
  '',
  'BEHÅLL ORDAGRANT: EASA, FAA, CAA, CAAP, CAAS, CAD, DGCA, SACAA, SANParks, NATS,',
  'GCAA, DCAA, Traficom, NOTAM, VLOS, BVLOS, EVLOS, FPV, MTOM, B-RID, Remote ID,',
  'Part 101/102/107, PCAR, RPC, UAPL, FRIA, FRZ, RFZ, CTR, NEMA, DigitalSky,',
  'NAV DRONE, App Store, Google Play — samt namn på myndigheter, lagar, appar, orter.',
  '',
  'PLATSHÅLLARE i klammer — {country}, {countryIn}, {countryGen}, {n}, {brand},',
  '{year}, {regulator}, {credential}, {aviation}, {language}, {date}, {mb}, {r1},',
  '{r2}, {r3}, {note}, {loaded}, {total}, {credential} — MÅSTE stå kvar exakt.',
  'De byts mot riktiga värden vid visning; tappas en går sidan sönder.',
  '{countryIn} = landsnamnet i "i landet"-form, {countryGen} = genitiv.',
  '',
  'TON: sakligt, ledigt, pilot-till-pilot. Sentence case. Inte marknadsföring.',
  '',
  'Returnera HELA JSON-filen ifylld, med samma struktur och samma poster i samma',
  'ordning. Ingen extra text runt omkring.',
].join('\n');

function writeChunks(dir, lang, kind, items, startNo, labelFn) {
  const files = [];
  let cur = [];
  let size = 0;
  const flush = () => {
    if (!cur.length) return;
    const no = startNo + files.length;
    const label = labelFn(files.length);
    const name = `${no}-${label}.json`;
    writeFileSync(
      join(dir, name),
      JSON.stringify({ instruction: INSTRUCTION(lang), lang, kind, items: cur }, null, 2) + '\n',
    );
    files.push({ name, n: cur.length, chars: size });
    cur = [];
    size = 0;
  };
  for (const it of items) {
    const len = (it.en?.length ?? 0) + (it.current?.length ?? 0);
    if (size + len > CHUNK && cur.length) flush();
    cur.push(it);
    size += len;
  }
  flush();
  return files;
}

const langs = onlyLang ? [onlyLang] : ORDER;
mkdirSync(outRoot, { recursive: true });
let no = 0;
const report = [];

for (const lang of langs) {
  const dirName = `${String(ORDER.indexOf(lang) + 1).padStart(2, '0')}-${LANG_NAME[lang] ?? lang}-${lang}`;
  const dir = join(outRoot, dirName);

  // 1. Chrome — knappar, rubriker, FAQ-mallar. Syns på varje sida.
  const chromeItems = [];
  for (const [key, entry] of Object.entries(chrome)) {
    if (key.startsWith('_') || typeof entry !== 'object') continue;
    if (SKIP_SEO.test(key)) continue;
    const current = entry[lang];
    if (!current || !String(current).trim()) continue;
    chromeItems.push({ id: `chrome|${key}`, en: entry.en ?? '', current, fixed: '', why: '' });
  }

  // 2. Regeltexterna per land.
  const ruleItems = [];
  const cellDir = join(CONTENT, lang);
  if (existsSync(cellDir)) {
    for (const f of readdirSync(cellDir).filter((x) => x.endsWith('.json') && !x.startsWith('_')).sort()) {
      const iso = f.replace(/\.json$/, '');
      const en = englishFor(iso);
      if (!en) continue;
      const cell = JSON.parse(readFileSync(join(cellDir, f), 'utf8'));
      const land = nameOf.get(iso) ?? iso;
      for (const key of LIST_FIELDS) {
        const src = en[key] ?? [];
        for (let i = 0; i < src.length; i++) {
          ruleItems.push({
            id: `cell|${iso}|${key}|${i}`, land,
            en: src[i], current: cell.fields?.[key]?.[i] ?? null, fixed: '', why: '',
          });
        }
      }
      for (const key of STRING_FIELDS) {
        if (!en[key]) continue;
        ruleItems.push({
          id: `cell|${iso}|${key}|-`, land,
          en: en[key], current: cell.fields?.[key] ?? null, fixed: '', why: '',
        });
      }
    }
  }
  if (!chromeItems.length && !ruleItems.length) continue;

  mkdirSync(dir, { recursive: true });
  // Reglerna numreras EFTER chrome-filerna. Hårdkodad tvåa gav kollision
  // (1-webbtexter + 2-webbtexter + 2-regler-A) när chrome delades i två.
  const ABC = 'ABCDEFGHIJKLMNOP';
  const chromeFilesOut = writeChunks(dir, lang, 'chrome', chromeItems, 1,
    (i) => (i === 0 ? 'webbtexter' : `webbtexter-${ABC[i]}`));
  const ruleFilesOut = writeChunks(dir, lang, 'cell', ruleItems, chromeFilesOut.length + 1,
    (i) => `regler-${ABC[i]}`);
  const written = [...chromeFilesOut, ...ruleFilesOut];

  const tot = written.reduce((a, f) => a + f.chars, 0);
  report.push({ dirName, files: written.length, items: chromeItems.length + ruleItems.length, chars: tot });
  no += 1;
  console.log(`${dirName.padEnd(26)} ${String(written.length).padStart(2)} filer  ${String(chromeItems.length + ruleItems.length).padStart(4)} poster  ${tot.toLocaleString('sv-SE').padStart(8)} tecken`);
}

console.log(`\n${no} språkmappar i ${outRoot}`);
console.log(`Totalt ${report.reduce((a, r) => a + r.files, 0)} filer, ${report.reduce((a, r) => a + r.chars, 0).toLocaleString('sv-SE')} tecken.`);
