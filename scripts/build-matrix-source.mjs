#!/usr/bin/env node
/**
 * Bygger data/_matrix_src.json — ETT paket med alla 55 länders ENGELSKA
 * innehåll + sourceHash, som matris-översättningsagenterna läser (en Read
 * istället för 55). Källa: src/content/en/{ISO}.json (icke-engelska länder)
 * + countries.json direkt (engelska länder, redan på engelska).
 *
 * Fältuppsättningen speglar EN-overlayns exakt → {lang}-overlays får samma form.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = process.cwd();
const EN_DIR = join(ROOT, 'src', 'content', 'en');

const countriesFile = existsSync(join(ROOT, 'data/live/countries.json'))
  ? JSON.parse(readFileSync(join(ROOT, 'data/live/countries.json'), 'utf8'))
  : JSON.parse(readFileSync(join(ROOT, 'data/snapshots/countries.json'), 'utf8'));

const STRING_FIELDS = [
  'disclaimerText', 'sectionLabelRules', 'sectionLabelPrimary',
  'sectionLabelSecondary', 'linksSheetTitle', 'dronePilotCredentialName',
];
const LIST_FIELDS = ['keyRules', 'importantNotes'];

function fieldsFromCountry(c) {
  const f = {};
  for (const k of STRING_FIELDS) if (c[k]) f[k] = c[k];
  for (const k of LIST_FIELDS) f[k] = c[k] ?? [];
  f.primaryLinks = (c.primaryLinks ?? []).map((l) => ({ title: l.title ?? '', description: l.description ?? '' }));
  f.secondaryLinks = (c.secondaryLinks ?? []).map((l) => ({ title: l.title ?? '', description: l.description ?? '' }));
  return f;
}

const hash = (obj) =>
  createHash('sha256').update(JSON.stringify(obj), 'utf8').digest('hex').slice(0, 32);

const bundle = {};
let fromOverlay = 0;
let fromCountries = 0;

for (const c of countriesFile.countries) {
  if (c.isoCode === 'OTHER') continue;
  const iso = c.isoCode.toUpperCase();
  const overlayPath = join(EN_DIR, `${iso}.json`);
  if (c.languageCode !== 'en' && existsSync(overlayPath)) {
    // Icke-engelskt land: använd den granskade EN-overlayn (redan engelsk prosa)
    const ov = JSON.parse(readFileSync(overlayPath, 'utf8'));
    bundle[iso] = { sourceHash: ov.meta?.sourceHash ?? hash(ov.fields), fields: ov.fields };
    fromOverlay++;
  } else {
    // Engelskt land (eller saknad overlay): innehållet i countries.json är engelskt
    const fields = fieldsFromCountry(c);
    bundle[iso] = { sourceHash: hash(fields), fields };
    fromCountries++;
  }
}

writeFileSync(join(ROOT, 'data', '_matrix_src.json'), JSON.stringify(bundle, null, 1));
console.log(
  `✓ _matrix_src.json: ${Object.keys(bundle).length} länder (${fromOverlay} ur EN-overlay, ${fromCountries} ur countries.json)`,
);
