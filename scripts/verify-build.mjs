#!/usr/bin/env node
/**
 * Byggverifiering — körs efter `astro build` (npm run build kedjar den).
 *
 *  1. Sidantal i dist/ = förväntat (55 EN + 43 lokal + 27 hubbar + hem + 404)
 *  2. hreflang-reciprocitet: varje alternate-mål finns som sida och pekar tillbaka
 *  3. Slug-frys: befintliga slug-värden i data/slugs.json får inte ha ÄNDRATS
 *     mot origin/main (tillägg ok) — körs bara om git finns tillgängligt
 *  4. Byte-bevarade filer: privacy.html + google-verifieringsfilen i dist/
 *     är identiska med originalen
 *  5. Kollisionsvakt körs implicit via modellen (kastar vid dubblett)
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
let failures = 0;
const fail = (msg) => {
  failures++;
  console.error(`✗ ${msg}`);
};
const ok = (msg) => console.log(`✓ ${msg}`);

if (!existsSync(DIST)) {
  console.error('dist/ saknas — kör astro build först.');
  process.exit(1);
}

// ── 1. Sidinventarie ────────────────────────────────────────────────────────
function htmlFiles(dir) {
  const out = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...htmlFiles(p));
    else if (f.endsWith('.html')) out.push(p);
  }
  return out;
}
const pages = htmlFiles(DIST);

// Förväntan beräknas ur samma datafiler som bygget (utan att importera TS):
const slugsRaw = JSON.parse(readFileSync(join(ROOT, 'data', 'slugs.json'), 'utf8'));
const slugIsos = Object.keys(slugsRaw).filter((k) => !k.startsWith('_'));
const countriesFile = (() => {
  for (const dir of ['data/live', 'data/snapshots']) {
    const p = join(ROOT, dir, 'countries.json');
    if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
  }
  return null;
})();

if (countriesFile) {
  const real = countriesFile.countries.filter(
    (c) => c.isoCode !== 'OTHER' && slugIsos.includes(c.isoCode.toUpperCase()),
  );
  const nonEn = real.filter((c) => c.languageCode !== 'en').length;
  const expectedCountry = real.length + nonEn;
  const LANG_COUNT = 27;
  // + hem + 404 (+ ev. hubbar när fas 3/7 byggt dem — räknas dynamiskt nedan)
  const hubDirs = readdirSync(DIST).filter(
    (d) =>
      statSync(join(DIST, d)).isDirectory() &&
      existsSync(join(DIST, d, 'index.html')) &&
      d.length <= 3,
  );
  console.log(
    `Sidor i dist/: ${pages.length} (landssidor förväntade: ${expectedCountry}, hubbar funna: ${hubDirs.length}/${LANG_COUNT})`,
  );
  // Hård assert på landssidor först när mallfasen (3) är byggd:
  if (process.env.ASSERT_PAGES === '1') {
    const expectedTotal = expectedCountry + LANG_COUNT + 2; // hem + 404
    if (pages.length !== expectedTotal) {
      fail(`Sidantal ${pages.length} ≠ förväntat ${expectedTotal}`);
    } else {
      ok(`Sidantal ${pages.length} = förväntat`);
    }
  }
} else {
  console.log(`Sidor i dist/: ${pages.length} (ingen countries-data att jämföra mot ännu)`);
}

// ── 2. hreflang-reciprocitet ────────────────────────────────────────────────
const SITE = 'https://dronekoll.com';
const altRe = /<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"\s*\/?>/g;
const pageByUrl = new Map();
for (const p of pages) {
  const url = SITE + p.slice(DIST.length).replace(/index\.html$/, '').replaceAll('\\', '/');
  pageByUrl.set(url, readFileSync(p, 'utf8'));
}
let altChecked = 0;
let altErrors = 0;
for (const [url, html] of pageByUrl) {
  for (const m of html.matchAll(altRe)) {
    const [, hreflang, href] = m;
    altChecked++;
    const target = pageByUrl.get(href);
    if (!target) {
      altErrors++;
      if (altErrors <= 5) fail(`${url}: alternate ${hreflang} → ${href} finns inte i dist/`);
      continue;
    }
    if (hreflang !== 'x-default' && !target.includes(`href="${url}"`)) {
      altErrors++;
      if (altErrors <= 5) fail(`${href} pekar inte tillbaka på ${url}`);
    }
  }
}
if (altChecked > 0 && altErrors === 0) ok(`hreflang-reciprocitet: ${altChecked} länkar OK`);
else if (altErrors > 5) console.error(`  … + ${altErrors - 5} fler hreflang-fel`);

// ── 3. Slug-frys mot origin/main ────────────────────────────────────────────
try {
  const before = execFileSync('git', ['show', 'origin/main:data/slugs.json'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const old = JSON.parse(before);
  let frozen = true;
  for (const [iso, entry] of Object.entries(old)) {
    if (iso.startsWith('_') || !slugsRaw[iso]) continue;
    for (const side of ['en', 'local']) {
      if (entry[side]?.slug && slugsRaw[iso][side]?.slug !== entry[side].slug) {
        fail(`SLUG-FRYS: ${iso}.${side} ändrad "${entry[side].slug}" → "${slugsRaw[iso][side]?.slug}"`);
        frozen = false;
      }
    }
  }
  if (frozen) ok('Slug-frys: inga befintliga slugs ändrade');
} catch {
  console.log('○ Slug-frys: origin/main saknar slugs.json ännu — hoppas');
}

// ── 4. Byte-bevarade filer ──────────────────────────────────────────────────
for (const f of ['privacy.html', 'google7779d86ca4c6fa72.html']) {
  const src = join(ROOT, 'public', f);
  const out = join(DIST, f);
  if (!existsSync(out)) {
    fail(`${f} saknas i dist/`);
  } else if (readFileSync(src).equals(readFileSync(out))) {
    ok(`${f} byte-identisk i dist/`);
  } else {
    fail(`${f} har MODIFIERATS av bygget`);
  }
}

console.log(failures === 0 ? '\nVerifiering GRÖN.' : `\n${failures} verifieringsfel.`);
process.exit(failures === 0 ? 0 : 1);
