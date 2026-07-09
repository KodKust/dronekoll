#!/usr/bin/env node
/**
 * Byggtids-hämtning av livedata → data/live/ (gitignorerad).
 *
 * Källor:
 *  - countries.json          (Gist raw — cache-bustas, rå-CDN cachar ~5 min)
 *  - classifier_strings.json (Gist raw — zontypstitlar × 27 språk)
 *  - schema_baseline.json    (pappilappi/status — zonantal per feed)
 *  - web-manifest.json       (pappilappi/airspace/web — bantade feeds; finns
 *                             först när web-optimize-workflowen körts, fas 4)
 *
 * Vakter:
 *  - misslyckad hämtning/parse → varning + snapshot-fallback (data/snapshots/)
 *  - countries.version < snapshot-version → REGRESSION → snapshot vinner
 *    (skyddar mot stale CDN-svar som annars skulle skriva över nyare innehåll)
 *
 * Bygget fungerar helt utan nät: ingest-lagret läser live/ först, snapshots/ sen.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const LIVE = join(ROOT, 'data', 'live');
const SNAP = join(ROOT, 'data', 'snapshots');

const cb = Date.now();
const SOURCES = [
  {
    name: 'countries.json',
    url: `https://gist.githubusercontent.com/KodKust/c01bd701b8de3549bd4fd7efaffbed97/raw/countries.json?cb=${cb}`,
    versionGuard: true,
  },
  {
    name: 'classifier_strings.json',
    url: `https://gist.githubusercontent.com/KodKust/d80e1ed0cb7c9910aa2683f83046d69c/raw/classifier_strings.json?cb=${cb}`,
  },
  {
    name: 'schema_baseline.json',
    url: `https://pappilappi.com/status/schema_baseline.json?cb=${cb}`,
  },
  {
    name: 'web-manifest.json',
    url: `https://pappilappi.com/airspace/web/web-manifest.json?cb=${cb}`,
    optional: true, // finns först när web-optimize-workflowen (fas 4) körts
  },
];

mkdirSync(LIVE, { recursive: true });

function snapshotVersion(name) {
  try {
    const snap = JSON.parse(readFileSync(join(SNAP, name), 'utf8'));
    return typeof snap.version === 'number' ? snap.version : null;
  } catch {
    return null;
  }
}

let failures = 0;
for (const src of SOURCES) {
  try {
    const res = await fetch(src.url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const parsed = JSON.parse(text); // validerar att det är JSON alls

    if (src.versionGuard) {
      const snapVer = snapshotVersion(src.name);
      const liveVer = typeof parsed.version === 'number' ? parsed.version : null;
      if (snapVer !== null && liveVer !== null && liveVer < snapVer) {
        console.warn(
          `⚠ ${src.name}: live v${liveVer} < snapshot v${snapVer} — CDN-regression, behåller snapshot`,
        );
        continue; // skriv inte live-filen → ingest faller tillbaka på snapshot
      }
    }

    writeFileSync(join(LIVE, src.name), text);
    const ver = typeof parsed.version === 'number' ? ` (v${parsed.version})` : '';
    console.log(`✓ ${src.name}${ver} — ${(text.length / 1024).toFixed(0)} kB`);
  } catch (err) {
    if (src.optional) {
      console.log(`○ ${src.name}: ej tillgänglig ännu (${err.message}) — ok, optional`);
    } else {
      failures++;
      console.warn(`⚠ ${src.name}: ${err.message} — bygget använder snapshot`);
    }
  }
}

console.log(
  failures === 0
    ? 'Livedata hämtad.'
    : `${failures} källa/or föll tillbaka på snapshots — bygget fortsätter.`,
);
