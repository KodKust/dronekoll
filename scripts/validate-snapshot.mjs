#!/usr/bin/env node
/**
 * Snapshot-validering (REPO-BUILD-02): körs av refresh-snapshots.yml FÖRE
 * commit, så snapshot-boten aldrig committar trasig/tom extern data. En
 * dålig fetch (206/tomt/HTML-felsida) ska stoppa committen, inte skeppas
 * som "färsk" fallback. Fail-closed: exit 1 vid minsta tvivel.
 *
 * Validerar data/live/*.json som senare kopieras till data/snapshots/.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const errors = [];

function loadJson(rel) {
  const p = join(ROOT, rel);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    errors.push(`${rel}: går inte att parsa JSON — ${e.message}`);
    return null;
  }
}

// countries.json — hårda invarianter (den fil som driver hela sajten + appen)
const countries = loadJson('data/live/countries.json');
if (!countries) {
  errors.push('data/live/countries.json saknas eller är ogiltig — hämtningen misslyckades');
} else {
  if (typeof countries.version !== 'number' || countries.version < 1)
    errors.push(`countries.json: version saknas/ogiltig (${countries.version})`);
  if (!Array.isArray(countries.countries))
    errors.push('countries.json: countries är inte en array');
  else {
    const n = countries.countries.length;
    // Sanity: vi har ~55 länder + OTHER. En tom/trunkerad fetch ska aldrig committas.
    if (n < 50) errors.push(`countries.json: bara ${n} länder (< 50) — trunkerad fetch?`);
    const missingIso = countries.countries.filter((c) => !c || typeof c.isoCode !== 'string');
    if (missingIso.length) errors.push(`countries.json: ${missingIso.length} poster saknar isoCode`);
    // Minst SE ska finnas + ha keyRules (grundinnehåll)
    const se = countries.countries.find((c) => c?.isoCode === 'SE');
    if (!se) errors.push('countries.json: SE saknas');
    else if (!Array.isArray(se.keyRules) || se.keyRules.length === 0)
      errors.push('countries.json: SE saknar keyRules — troligen tomt innehåll');
  }
}

// Övriga snapshot-filer: ska åtminstone parsa som JSON om de finns.
for (const f of ['classifier_strings.json', 'schema_baseline.json', 'web-manifest.json']) {
  const p = `data/live/${f}`;
  if (existsSync(join(ROOT, p))) loadJson(p); // fyller errors[] vid parsefel
}

if (errors.length) {
  console.error('✗ Snapshot-validering MISSLYCKADES — committar INTE:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`✓ Snapshot-validering grön (${countries.countries.length} länder, v${countries.version})`);
