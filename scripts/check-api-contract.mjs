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
let cellFilesChecked = 0;
const cellFailuresBefore = failures;
const residentCells = [];
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

      // legalStatus pensionerades 2026-09-24 (apiSchemaVersion 3): nyckeln får inte
      // komma tillbaka — inte ens som null. Den var positionellt knuten till
      // fields-raderna och hamnade ur position vid varje radändring.
      if ('legalStatus' in body) fail(`${path}: legalStatus är pensionerad — nyckeln får inte finnas (apiSchemaVersion 3)`);
      if (typeof body.meta?.apiSchemaVersion === 'number' && body.meta.apiSchemaVersion < 3) {
        fail(`${path}: meta.apiSchemaVersion ${body.meta.apiSchemaVersion} < 3 (legalStatus-borttagningen kräver 3)`);
      }

      // Resident-fälten (apiSchemaVersion 4, CH fr/it): frivilliga, men NÄR de
      // finns måste formen vara exakt den tourist_cell.dart parsar — en trasig
      // slide/regelpost gör hela listan null i appen (tyst, inte hårt).
      const fl = body.fields ?? {};
      const isSlide = (s) =>
        s && typeof s === 'object' && typeof s.title === 'string' && typeof s.body === 'string' &&
        (s.tag === undefined || typeof s.tag === 'string');
      for (const key of ['onboarding', 'onboardingExtended']) {
        if (key in fl && fl[key] !== null) {
          if (!Array.isArray(fl[key]) || !fl[key].every(isSlide)) fail(`${path}: fields.${key} måste vara [{title, body, tag?}]`);
          else if (fl[key].length === 0) fail(`${path}: fields.${key} är tom — utelämna nyckeln i stället`);
        }
      }
      if ('rules' in fl && fl.rules !== null) {
        if (typeof fl.rules !== 'object' || Array.isArray(fl.rules)) fail(`${path}: fields.rules måste vara {TYP: {rule, source}}`);
        else
          for (const [k, r] of Object.entries(fl.rules)) {
            if (!r || typeof r.rule !== 'string' || r.rule.length === 0 || typeof r.source !== 'string')
              fail(`${path}: fields.rules.${k} måste vara {rule: string≠'', source: string}`);
            if (k !== k.toUpperCase() || k.includes(':')) fail(`${path}: fields.rules-nyckeln "${k}" ska vara VERSAL utan ISO-prefix`);
          }
      }
      if ('airspaceMapUrl' in fl && fl.airspaceMapUrl !== null && !isNonEmptyString(fl.airspaceMapUrl))
        fail(`${path}: fields.airspaceMapUrl måste vara icke-tom sträng eller utelämnas`);
      for (const key of ['primaryLinks', 'secondaryLinks']) {
        for (const l of fl[key] ?? []) {
          if ('localizedUrl' in l && !isNonEmptyString(l.localizedUrl)) fail(`${path}: ${key} localizedUrl måste vara icke-tom sträng`);
          if (isNonEmptyString(l.localizedUrl) && new URL(l.localizedUrl).host !== new URL(l.url).host)
            fail(`${path}: ${key} localizedUrl byter värdnamn (${l.url} → ${l.localizedUrl})`);
        }
      }
      if (fl.checklist !== null && fl.checklist !== undefined) {
        if (!Array.isArray(fl.checklist) || !fl.checklist.every((s) => s && typeof s.title === 'string' && isStringArray(s.items)))
          fail(`${path}: fields.checklist måste vara [{title, items: string[]}]`);
      }
      if ('onboarding' in fl || 'rules' in fl) residentCells.push(path);
    }
  }
}
if (cellFilesChecked === 0) fail('inga cell-filer hittades i dist/api/cell/');
else if (failures === cellFailuresBefore) {
  ok(`cell: ${cellFilesChecked} filer OK (ingen bär legalStatus, alla apiSchemaVersion ≥ 3)`);
  ok(`cell: ${residentCells.length} med resident-fält${residentCells.length ? ' — ' + residentCells.join(', ') : ''}`);
}

console.log(failures === 0 ? '\nAPI-kontrakt GRÖNT.' : `\n${failures} kontraktsfel.`);
process.exit(failures === 0 ? 0 : 1);
