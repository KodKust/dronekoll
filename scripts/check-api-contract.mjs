#!/usr/bin/env node
/**
 * API-kontraktstest (v8-revision, avsnitt-4-uppföljning): verifierar att
 * /api/visitor/{lang}.json och /api/cell/{lang}/{iso}.json faktiskt uppfyller
 * det appen litar på — särskilt SKYDDAR detta mot regressionen där
 * fields.keyRules/importantNotes av misstag blir något annat än string[].
 * Appens Dart-parsning (tourist_cell.dart) läser dem via
 * `v.whereType<String>().toList()` — byts elementtypen ut TYST FALLER POSTERNA
 * BORT (tom lista, inget fel) i stället för att cellen förkastas. Detta test
 * är den enda platsen som fångar det innan det når appen.
 *
 * Kör: npm run build:offline && node scripts/check-api-contract.mjs
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist', 'api');
let failures = 0;
const fail = (msg) => { failures++; console.error(`✗ ${msg}`); };
const ok = (msg) => console.log(`✓ ${msg}`);

if (!existsSync(DIST)) {
  console.error('dist/api saknas — kör npm run build:offline först.');
  process.exit(1);
}

const isStringArray = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');
const isNonEmptyString = (v) => typeof v === 'string' && v.length > 0;

// ── /api/visitor/{lang}.json ────────────────────────────────────────────────
const visitorDir = join(DIST, 'visitor');
const visitorFiles = existsSync(visitorDir)
  ? readdirSync(visitorDir).filter((f) => f.endsWith('.json'))
  : [];
let visitorEntriesChecked = 0;
for (const f of visitorFiles) {
  const lang = f.replace(/\.json$/, '');
  let body;
  try {
    body = JSON.parse(readFileSync(join(visitorDir, f), 'utf8'));
  } catch (e) {
    fail(`visitor/${f}: ogiltig JSON (${e.message})`);
    continue;
  }
  if (typeof body.meta?.apiSchemaVersion !== 'number') fail(`visitor/${f}: meta.apiSchemaVersion saknas`);
  if (body.meta?.lang !== lang) fail(`visitor/${f}: meta.lang "${body.meta?.lang}" ≠ filnamn "${lang}"`);
  if (typeof body.countries !== 'object' || body.countries === null) {
    fail(`visitor/${f}: countries saknas/fel typ`);
    continue;
  }
  for (const [iso, entry] of Object.entries(body.countries)) {
    visitorEntriesChecked++;
    if (!isNonEmptyString(entry.q)) fail(`visitor/${f} ${iso}: q saknas/tom`);
    if (!isNonEmptyString(entry.a)) fail(`visitor/${f} ${iso}: a saknas/tom`);
    if (!isNonEmptyString(entry.url)) fail(`visitor/${f} ${iso}: url saknas/tom`);
    if (typeof entry.specific !== 'boolean') fail(`visitor/${f} ${iso}: specific måste vara boolean`);
  }
}
if (visitorFiles.length === 0) fail('inga visitor-filer hittades i dist/api/visitor/');
else if (failures === 0) ok(`visitor: ${visitorFiles.length} språkfiler, ${visitorEntriesChecked} poster OK`);

// ── /api/cell/{lang}/{iso}.json ─────────────────────────────────────────────
const cellDir = join(DIST, 'cell');
let cellFilesChecked = 0, legalStatusPresent = 0, legalStatusNull = 0;
const cellFailuresBefore = failures;
if (existsSync(cellDir)) {
  for (const lang of readdirSync(cellDir)) {
    const langDir = join(cellDir, lang);
    for (const f of readdirSync(langDir)) {
      if (!f.endsWith('.json')) continue;
      const path = `cell/${lang}/${f}`;
      let body;
      try {
        body = JSON.parse(readFileSync(join(langDir, f), 'utf8'));
      } catch (e) {
        fail(`${path}: ogiltig JSON (${e.message})`);
        continue;
      }
      cellFilesChecked++;

      if (typeof body.meta?.apiSchemaVersion !== 'number') fail(`${path}: meta.apiSchemaVersion saknas`);

      // KRITISK KONTRAKTSGRÄNS: appens Dart-parsning kräver ren string[].
      // Se filhuvudet — en typförändring här faller tyst i appen, inte hårt.
      if (!isStringArray(body.fields?.keyRules)) fail(`${path}: fields.keyRules måste vara string[]`);
      if (!isStringArray(body.fields?.importantNotes)) fail(`${path}: fields.importantNotes måste vara string[]`);

      const ls = body.legalStatus;
      if (ls === null) {
        legalStatusNull++;
      } else if (ls) {
        legalStatusPresent++;
        if (ls.keyRules.length !== body.fields.keyRules.length) {
          fail(`${path}: legalStatus.keyRules.length (${ls.keyRules.length}) ≠ fields.keyRules.length (${body.fields.keyRules.length})`);
        }
        if (ls.importantNotes.length !== body.fields.importantNotes.length) {
          fail(`${path}: legalStatus.importantNotes.length (${ls.importantNotes.length}) ≠ fields.importantNotes.length (${body.fields.importantNotes.length})`);
        }
        for (const c of [...ls.keyRules, ...ls.importantNotes]) {
          if (!isNonEmptyString(c.claimId)) fail(`${path}: claim saknar claimId`);
          if (!isNonEmptyString(c.status)) fail(`${path}: ${c.claimId ?? '?'} saknar status`);
          if (!isNonEmptyString(c.reviewState)) fail(`${path}: ${c.claimId ?? '?'} saknar reviewState`);
        }
      } else {
        fail(`${path}: legalStatus-nyckel saknas helt (varken objekt eller null)`);
      }
    }
  }
}
if (cellFilesChecked === 0) fail('inga cell-filer hittades i dist/api/cell/');
else if (failures === cellFailuresBefore) {
  ok(`cell: ${cellFilesChecked} filer OK (legalStatus: ${legalStatusPresent} med, ${legalStatusNull} utan)`);
}
if (legalStatusNull > 0) {
  console.warn(`  ⚠ ${legalStatusNull} celler saknar legalStatus (längdmiss mot fields — se cell-endpointens defensiva fallback)`);
}

console.log(failures === 0 ? '\nAPI-kontrakt GRÖNT.' : `\n${failures} kontraktsfel.`);
process.exit(failures === 0 ? 0 : 1);
