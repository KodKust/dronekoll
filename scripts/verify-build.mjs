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
import { checkWebStrings } from './check-web-strings.mjs';

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
// Passthrough-filerna (byte-bevarade, ej Astro-sidor) räknas inte som sidor
const PASSTHROUGH = new Set(['privacy.html', 'google7779d86ca4c6fa72.html']);
const pages = htmlFiles(DIST).filter((p) => !PASSTHROUGH.has(p.slice(DIST.length + 1)));

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
  // Matris (it4): en (alla) + native (icke-en) + översatta overlays i src/content/{lang}/
  const CONTENT = join(ROOT, 'src', 'content');
  let matrixOverlays = 0;
  if (existsSync(CONTENT)) {
    for (const d of readdirSync(CONTENT)) {
      if (d === 'en' || d === 'faq-overrides' || !statSync(join(CONTENT, d)).isDirectory()) continue;
      matrixOverlays += readdirSync(join(CONTENT, d)).filter(
        (f) => f.endsWith('.json') && !f.startsWith('_'),
      ).length;
    }
  }
  const expectedCountry = real.length + nonEn + matrixOverlays;
  const LANG_COUNT = 27;
  const featureSlugs = Object.keys(
    JSON.parse(readFileSync(join(ROOT, 'data', 'feature-slugs.json'), 'utf8')),
  ).filter((k) => !k.startsWith('_'));
  // Språkgrindade funktionssidor: en feature renderas BARA på språk där alla
  // kärnnycklar har egen text (samma villkor + källa som model.ts featureLangs;
  // håll dem i synk). Gamla formeln (features × 27) räknade nya grindade
  // features som fullt utrullade → falskt sidantal-fel som blockerade
  // deployen 2026-07-29→30 när /app/travel/ lanserades på få språk.
  const FEATURE_CORE_KEYS = ['name', 'title', 'desc', 'h1.pre', 'h1.accent', 'lede'];
  const featureStrings = JSON.parse(
    readFileSync(join(ROOT, 'data', 'feature-strings.json'), 'utf8'),
  );
  const gatedFeaturePages = featureSlugs.reduce((sum, slug) => {
    const langs = Object.keys(featureStrings[`feat.${slug}.name`] ?? {}).filter((l) =>
      FEATURE_CORE_KEYS.every((k) => {
        const v = featureStrings[`feat.${slug}.${k}`]?.[l];
        return typeof v === 'string' && v.trim() !== '';
      }),
    );
    return sum + langs.length;
  }, 0);
  const appPages = LANG_COUNT + gatedFeaturePages; // översikt ×27 + grindade features
  // Metodsidan /{lang}/how-we-verify/ är också språkgrindad (model.ts
  // methodLangs — samma nycklar, samma källa web_strings.json; håll i synk).
  const METHOD_CORE_KEYS = [
    'meta.title.method', 'meta.desc.method', 'method.bc', 'method.h1.pre',
    'method.h1.accent', 'method.lede', 'method.byline', 'method.author',
  ];
  const wsCat = JSON.parse(
    readFileSync(join(ROOT, 'data', 'web-strings', 'web_strings.json'), 'utf8'),
  );
  const methodPages = Object.keys(wsCat['method.bc'] ?? {}).filter((l) =>
    METHOD_CORE_KEYS.every((k) => {
      const v = wsCat[k]?.[l];
      return typeof v === 'string' && v.trim() !== '';
    }),
  ).length;
  // + hem + 404 (+ ev. hubbar när fas 3/7 byggt dem — räknas dynamiskt nedan)
  const hubDirs = readdirSync(DIST).filter(
    (d) =>
      statSync(join(DIST, d)).isDirectory() &&
      existsSync(join(DIST, d, 'index.html')) &&
      d.length <= 3 &&
      d !== 'go', // /go är app-bryggan, ingen språkhubb
  );
  console.log(
    `Sidor i dist/: ${pages.length} (landssidor förväntade: ${expectedCountry}, hubbar funna: ${hubDirs.length}/${LANG_COUNT})`,
  );
  // Hård assert på landssidor först när mallfasen (3) är byggd:
  if (process.env.ASSERT_PAGES === '1') {
    const expectedTotal = expectedCountry + LANG_COUNT + appPages + methodPages + 4; // hem + 404 + go + privacy
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

// ── 5. Fullt lokaliserade chrome-nycklar: 27/27 + platshållar-paritet ────────
// Nycklar som MÅSTE finnas på alla 27 språk — annars faller t() tyst till EN
// och renderar engelska på fel-språkiga sidor (blandspråks-buggen Fas 2 rättade:
// airspaceMapLabel/verificationWord kom app-ägda på landets modersmål). Lägg nya
// blandspråkskänsliga i18n-nycklar i REQUIRE_27 så bygget vaktar dem.
{
  const LANGS = ['bg','cs','da','de','el','en','es','et','fi','fr','hr','hu','is','it','lt','lv','mt','nl','no','pl','pt','ro','sk','sl','sv','tr','uk'];
  const REQUIRE_27 = ['sources.verified', 'map.openOfficial', 'related.title', 'quickanswer.title', 'quickanswer.body',
    // Turist-/utlännings-FAQ: samma blandspråksrisk. Landsnoterna (visitor-notes.json)
    // vaktas av sektion 6 — här vaktas bara mallarna.
    'faq.q.visitor', 'faq.tpl.visitor.easa', 'faq.tpl.visitor.other', 'faq.tpl.visitor.generic',
    // Sajtens H1. Alla 27 språk bär landsnamnet, så full paritet gäller här.
    // CASE_ALIASES nedan låter finskan välja kasus utan att flaggas.
    'hero.h1.country'];
  const ws = JSON.parse(readFileSync(join(ROOT, 'data', 'web-strings', 'web_strings.json'), 'utf8'));
  // countryIn/countryGen är KASUSVARIANTER av samma landsnamn (finskan böjer
  // namnet i stället för att sätta preposition framför — se
  // data/fi-country-forms.json). Paritetsvakten ska fortfarande fånga tappade
  // och påhittade variabler, men inte flagga att fi valt rätt kasus.
  const CASE_ALIASES = { countryIn: 'country', countryGen: 'country' };
  const phSet = (s) =>
    new Set(
      [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => CASE_ALIASES[m[1]] ?? m[1]),
    );
  for (const key of REQUIRE_27) {
    const entry = ws[key];
    if (!entry) { fail(`i18n-vakt: nyckeln "${key}" saknas i web_strings.json`); continue; }
    const missing = LANGS.filter((l) => !entry[l] || !String(entry[l]).trim());
    if (missing.length) { fail(`i18n-vakt: "${key}" saknar språk: ${missing.join(', ')}`); continue; }
    const enPh = phSet(entry.en);
    const drift = LANGS.filter((l) => {
      const p = phSet(entry[l]);
      return p.size !== enPh.size || [...enPh].some((x) => !p.has(x));
    });
    if (drift.length) fail(`i18n-vakt: "${key}" platshållar-drift mot EN i: ${drift.join(', ')}`);
    else ok(`i18n-vakt: "${key}" fullständig (27/27)`);
  }

  // ── FAQ-frågornas landsnamn: fasad utrullning ────────────────────────────
  // Dessa fyra går in i FAQPage-schemat och är därför tunga SEO-strängar. De
  // tömdes på {country} 2026-07-23 i alla 27 språk och söktrafiken föll från
  // ~59 till ~8 besökare/dygn.
  //
  // Landsnamnet är återinfört språk för språk, inte i ett svep: ett språk som
  // böjer landsnamnet (cs "v Německu", pl "w Niemczech") behöver en formtabell
  // som finskans data/fi-country-forms.json, annars byts ett fel mot ett annat.
  // Full paritet mot EN kan alltså inte gälla — den skulle tvinga fram exakt
  // det slarvet. I stället låser vi fast de utrullade språken.
  //
  // → Utökas när ett språk får landsformer. Listan ÄR kontraktet.
  // ALLA 27 språk är utrullade sedan 2026-07-29. Listan behålls som kontrakt:
  // ett nytt språk måste läggas till här för att vaktas.
  const COUNTRY_ROLLED_OUT = LANGS;
  const REQUIRE_COUNTRY = ['faq.q.credential', 'faq.q.rules', 'faq.q.zones', 'faq.q.authority'];
  const CASE_KEYS = new Set(['country', 'countryIn', 'countryGen']);
  for (const key of REQUIRE_COUNTRY) {
    const entry = ws[key];
    if (!entry) { fail(`i18n-vakt: nyckeln "${key}" saknas i web_strings.json`); continue; }
    const missing = LANGS.filter((l) => !entry[l] || !String(entry[l]).trim());
    if (missing.length) { fail(`i18n-vakt: "${key}" saknar språk: ${missing.join(', ')}`); continue; }
    // Utrullade språk MÅSTE bära landsnamnet.
    const tappat = COUNTRY_ROLLED_OUT.filter((l) => ![...phSet(entry[l])].includes('country'));
    // Alla språk: bara kända platshållare (fångar {maa}, {land} m.m.).
    const okänd = LANGS.filter((l) =>
      [...String(entry[l]).matchAll(/\{(\w+)\}/g)].some((m) => !CASE_KEYS.has(m[1])),
    );
    if (tappat.length) fail(`i18n-vakt: "${key}" tappat landsnamnet i: ${tappat.join(', ')}`);
    if (okänd.length) fail(`i18n-vakt: "${key}" okänd platshållare i: ${okänd.join(', ')}`);
    if (!tappat.length && !okänd.length)
      ok(`i18n-vakt: "${key}" 27/27 · landsnamn i ${COUNTRY_ROLLED_OUT.length} utrullade språk`);
  }
}

// ── 7. Landsnamnsformer per språk: fullständiga tabeller ────────────────────
// Mallarna renderar {countryIn}/{countryGen}, aldrig nominativen — saknas ett
// land i tabellen faller countryParams tillbaka på nominativen och sidan får
// tillbaka exakt den trasiga grammatik tabellen infördes för att bort ("maassa
// Suomi", "nell'Germania"). Nytt land i slugs-matrisen → ny rad i VARJE
// data/{lang}-country-forms.json.
{
  const matrix = JSON.parse(readFileSync(join(ROOT, 'data', 'slugs-matrix.json'), 'utf8'));
  const isos = Object.keys(matrix).filter((k) => !k.startsWith('_'));
  // FI själv saknas i matrisen (fi är dess eget språk) — kräv det ändå.
  const required = [...new Set([...isos, 'FI'])];
  // Bara finskan har mallar som använder {countryGen}; övriga behöver bara "in".
  const NEEDS_GEN = new Set(['fi']);
  const tables = readdirSync(join(ROOT, 'data')).filter((f) => f.endsWith('-country-forms.json'));
  if (!tables.length) fail('landsformer: hittade inga data/*-country-forms.json');
  for (const file of tables.sort()) {
    const lang = file.replace('-country-forms.json', '');
    const forms = JSON.parse(readFileSync(join(ROOT, 'data', file), 'utf8'));
    const missing = required.filter((iso) => {
      const f = forms[iso];
      if (!f || !String(f.in || '').trim()) return true;
      return NEEDS_GEN.has(lang) && !String(f.gen || '').trim();
    });
    if (missing.length) fail(`${lang}-former: saknar ${NEEDS_GEN.has(lang) ? 'in/gen' : 'in'} för ${missing.join(', ')}`);
    else ok(`${lang}-former: ${required.length}/${required.length} landsnamn kompletta`);
  }
}

// ── 8. Inga råa {platshållare} i renderad HTML ──────────────────────────────
// t() (src/lib/i18n.ts) substituerar BARA de params anropet skickar och varnar
// aldrig. En mall som får en platshållare anroparen inte skickar renderar den
// som SYNLIG råtext — sajten och systerappen har haft tre sådana läckage
// ({0} i drönarkortets rubrik, {countryIn} vid H1-omskrivningen). Sektion 5
// vaktar källsträngarna; denna fångar hela vägen ut, för ALLA nycklar.
// Mätt vid införandet: 0 träffar över samtliga sidor, alltså falsklarmsfritt.
{
  // ⚠️ ALLOWLIST — nya platshållarnamn MÅSTE läggas till här, annars vaktar
  // vakten dem inte. Bevisat 2026-07-29: {overlay}/{notam}/{notamExtra}/{langs}
  // infördes, läckte rått på 27 sidor, och bygget gick GRÖNT eftersom namnen
  // saknades i listan. En vakt med allowlist är tyst om det den inte känner.
  const RAW = /\{(country|countryIn|countryGen|year|brand|n|overlay|notam|notamExtra|langs|date|regulator|aviation|credential|note|r1|r2|r3)\}/;
  const leaks = [];
  for (const [url, html] of pageByUrl) {
    const m = html.match(RAW);
    if (m) leaks.push(`${url} → ${m[0]}`);
  }
  if (leaks.length)
    fail(`Rå platshållare i renderad HTML (${leaks.length} sidor): ${leaks.slice(0, 5).join(' · ')}`);
  else ok(`Inga råa {platshållare} i ${pageByUrl.size} sidor`);
}

// ── 9. Rubrikstruktur + aria-labelledby på landssidorna ─────────────────────
// Reglerna och källorna renderades länge som <p class="overline"> — de SÅG ut
// som rubriker men stod utanför dokumentets rubrikstruktur, så sidans två
// viktigaste avsnitt syntes varken för skärmläsare, snippet-uttag eller
// AI-chunkning. Nu är de <h2> med id, och varje <section> pekar på sin rubrik.
// Vakten fångar det som lätt går sönder vid mallarbete: en rubrik som tappar
// sitt id, ett aria-labelledby som pekar i tomma luften, eller två element som
// råkar dela id (då blir referensen tyst fel i stället för trasig).
{
  const missing = [];
  const dangling = [];
  const duped = [];
  for (const [url, html] of pageByUrl) {
    const labels = [...html.matchAll(/aria-labelledby="([^"]+)"/g)].map((m) => m[1]);
    if (labels.length === 0) continue; // hubbar/övriga mallar
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    const idSet = new Set(ids);
    if (ids.length !== idSet.size) duped.push(url);
    for (const l of labels) if (!idSet.has(l)) dangling.push(`${url} → #${l}`);
    // Regler-/källrubrikerna krävs bara av LANDSSIDOR. Andra mallar (metodsidan,
    // funktionssidorna) har aria-labelledby men varken regler eller källor.
    // Kännetecknet är regelbandet id="rules" — det finns bara på landssidan.
    const isCountryPage = /\sid="rules"/.test(html);
    if (isCountryPage) {
      for (const need of ['rules-heading', 'sources-heading']) {
        if (!idSet.has(need)) missing.push(`${url} → #${need}`);
      }
    }
  }
  const n = pageByUrl.size;
  if (dangling.length) fail(`aria-labelledby utan mål (${dangling.length}): ${dangling.slice(0, 5).join(' · ')}`);
  if (missing.length) fail(`Landssida utan regler-/källrubrik (${missing.length}): ${missing.slice(0, 5).join(' · ')}`);
  if (duped.length) fail(`Dubblerade id på samma sida (${duped.length}): ${duped.slice(0, 5).join(' · ')}`);
  if (!dangling.length && !missing.length && !duped.length)
    ok(`Rubrikstruktur hel — inga trasiga aria-referenser, inga id-dubbletter (${n} sidor)`);
}

// ── 10. Sitemapen får bara innehålla kanoniska URL:er ───────────────────────
// En sitemap är en lista över sidor vi BER Google indexera. Står där en sida
// som samtidigt säger "originalet finns någon annanstans" ger vi två motstridiga
// besked om samma URL, och Google får välja själv. Uppstod konkret när /en/
// pekades om mot "/" (2026-07-29): sidan låg kvar i sitemapen i samma andetag
// som den kanonikaliserades bort. Samma vakt fångar nästa gång en dublett
// kanonikaliseras utan att lyftas ur listan.
{
  const sm = pages.find((p) => p.endsWith('sitemap.xml'));
  const smPath = join(DIST, 'sitemap.xml');
  const xml = existsSync(smPath) ? readFileSync(smPath, 'utf8') : (sm ? readFileSync(sm, 'utf8') : null);
  if (!xml) {
    console.log('○ Sitemap-canonicalvakt: dist/sitemap.xml saknas — hoppas');
  } else {
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const bad = [];
    for (const loc of locs) {
      const html = pageByUrl.get(loc);
      if (!html) continue; // täcks av sektion 1
      const m = html.match(/rel="canonical" href="([^"]+)"/);
      if (m && m[1] !== loc) bad.push(`${loc} → canonical ${m[1]}`);
    }
    if (bad.length)
      fail(`Sitemap listar icke-kanoniska URL:er (${bad.length}): ${bad.slice(0, 5).join(' · ')}`);
    else ok(`Sitemap: alla ${locs.length} URL:er är sin egen canonical`);
  }
}

// ── 6. Sträng-/notvakt: visitor-notes struktur + platshållare/skriftsystem ───
// Kompletterar sektion 5: den vaktar web_strings-nycklar, denna vaktar de 49
// landsnoterna (inga { } som bryter t()-substitution, skiljetecken, längd,
// giltig ISO, kyrilliska/grekiska) + 27/27-kompletthet under STRICT_L10N=1.
console.log('\nSträng-/notvakt:');
failures += checkWebStrings();

console.log(failures === 0 ? '\nVerifiering GRÖN.' : `\n${failures} verifieringsfel.`);
process.exit(failures === 0 ? 0 : 1);
