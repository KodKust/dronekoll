#!/usr/bin/env node
/**
 * Delar _matrix_src.json i data/_matrix_todo/{lang}.json — en per målspråk,
 * innehåller ENDAST de länder språket ska översätta (native-länderna exkluderade,
 * de använder countries.json direkt). Varje agent läser bara sin egen fil.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const TARGET_LANGS = [
  'bg', 'cs', 'da', 'de', 'el', 'es', 'et', 'fi', 'fr', 'hr', 'hu', 'is', 'it',
  'lt', 'lv', 'mt', 'nl', 'no', 'pl', 'pt', 'ro', 'sk', 'sl', 'sv', 'tr', 'uk',
];

const bundle = JSON.parse(readFileSync(join(ROOT, 'data', '_matrix_src.json'), 'utf8'));
const countriesFile = existsSync(join(ROOT, 'data/live/countries.json'))
  ? JSON.parse(readFileSync(join(ROOT, 'data/live/countries.json'), 'utf8'))
  : JSON.parse(readFileSync(join(ROOT, 'data/snapshots/countries.json'), 'utf8'));

// iso → native languageCode
const native = {};
for (const c of countriesFile.countries) if (c.isoCode !== 'OTHER') native[c.isoCode.toUpperCase()] = c.languageCode;

const OUT = join(ROOT, 'data', '_matrix_todo');
mkdirSync(OUT, { recursive: true });

const summary = {};
for (const lang of TARGET_LANGS) {
  const todo = {};
  for (const [iso, entry] of Object.entries(bundle)) {
    if (native[iso] === lang) continue; // native → countries.json, ingen overlay
    todo[iso] = entry;
  }
  writeFileSync(join(OUT, `${lang}.json`), JSON.stringify(todo, null, 1));
  summary[lang] = Object.keys(todo).length;
}
const total = Object.values(summary).reduce((a, b) => a + b, 0);
console.log(`✓ ${TARGET_LANGS.length} att-göra-filer, ${total} overlays totalt`);
console.log('Per språk:', JSON.stringify(summary));
