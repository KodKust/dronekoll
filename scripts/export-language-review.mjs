#!/usr/bin/env node
/**
 * Exporterar sajtens chrome-strängar (web_strings + feature-strings) som EN fil
 * per språk för extern språkgranskning — rättstavning, grammatik, kasus,
 * felöversättningar.
 *
 * Skiljer sig från export-translation-job.mjs: där är källan engelsk och målet
 * en NY översättning. Här finns redan en översättning och frågan är om den är
 * korrekt. Därför skickas både EN och nuvarande text, och granskaren fyller i
 * "fixed" ENDAST där något faktiskt är fel — tomt fält = texten är bra.
 *
 *   node scripts/export-language-review.mjs --lang fi
 *   node scripts/export-language-review.mjs --lang fi,et,lv,lt,pl,hu
 *
 * Ut: data/_outsourced/{lang}.review.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'data', '_outsourced');
const args = process.argv.slice(2);
const langArg = args.includes('--lang') ? args[args.indexOf('--lang') + 1] : null;
if (!langArg) {
  console.error('Ange språk: node scripts/export-language-review.mjs --lang fi[,et,lv]');
  process.exit(2);
}

const LANG_NAME = {
  bg: 'bulgariska', cs: 'tjeckiska', da: 'danska', de: 'tyska', el: 'grekiska',
  es: 'spanska', et: 'estniska', fi: 'finska', fr: 'franska', hr: 'kroatiska',
  hu: 'ungerska', is: 'isländska', it: 'italienska', lt: 'litauiska',
  lv: 'lettiska', mt: 'maltesiska', nl: 'nederländska', no: 'norska',
  pl: 'polska', pt: 'portugisiska', ro: 'rumänska', sk: 'slovakiska',
  sl: 'slovenska', sv: 'svenska', tr: 'turkiska', uk: 'ukrainska',
};

const catalog = {};
for (const rel of ['data/web-strings/web_strings.json', 'data/feature-strings.json']) {
  const p = join(ROOT, rel);
  if (existsSync(p)) Object.assign(catalog, JSON.parse(readFileSync(p, 'utf8')));
}

const instruction = (lang) => [
  `Du granskar ${LANG_NAME[lang] ?? lang}n på dronekoll.com — en kunskapsbank om drönarregler.`,
  '',
  'UPPGIFT: hitta FEL. Stavfel, grammatikfel, fel kasus eller numerus, felöversättningar,',
  'ord som inte betyder vad de ska, och stelheter som avslöjar maskinöversättning.',
  '',
  'FYLL I "fixed" ENDAST där något faktiskt är fel. Är texten bra: lämna "fixed" tomt.',
  'Skriv INTE om text som redan är korrekt bara för att den kan formuleras annorlunda —',
  'stilomskrivningar utan sakfel är inte önskade och skapar bara granskningsarbete.',
  'Motivera varje rättelse kort i "why" (t.ex. "partitiv krävs efter räkneord").',
  '',
  'PLATSHÅLLARE i klammer — {country}, {n}, {brand}, {year}, {countryIn}, {countryGen},',
  '{regulator}, {credential}, {language}, {date}, {mb}, {loaded}, {total} — MÅSTE stå kvar',
  'exakt som de är. De byts mot riktiga värden vid visning. Tappas en går sidan sönder.',
  '{countryIn} = landsnamn i "i landet"-form (Suomessa), {countryGen} = genitiv (Suomen).',
  '',
  'BEHÅLL ORDAGRANT: EASA, NOTAM, VLOS, App Store, Google Play, samt namn på',
  'myndigheter och lagar.',
  '',
  'TON: sakligt, ledigt, pilot-till-pilot. Sentence case. Inte marknadsföring.',
  '',
  'Returnera SAMMA JSON-struktur ifylld, utan extra text runt omkring.',
].join('\n');

mkdirSync(OUT, { recursive: true });
for (const lang of langArg.split(',').map((s) => s.trim()).filter(Boolean)) {
  const items = [];
  for (const [key, entry] of Object.entries(catalog)) {
    if (key.startsWith('_') || typeof entry !== 'object') continue;
    const current = entry[lang];
    if (!current || !String(current).trim()) continue;
    items.push({ key, en: entry.en ?? '', current, fixed: '', why: '' });
  }
  const chars = items.reduce((n, i) => n + i.current.length, 0);
  writeFileSync(
    join(OUT, `${lang}.review.json`),
    JSON.stringify({ instruction: instruction(lang), lang, items }, null, 2) + '\n',
  );
  console.log(`✓ ${lang}.review.json — ${items.length} strängar, ${chars.toLocaleString('sv-SE')} tecken`);
}
console.log(`\nFilerna ligger i data/_outsourced/ — skicka dem som de är.`);
