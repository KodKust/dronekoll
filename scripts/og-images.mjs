#!/usr/bin/env node
/**
 * OG-bilder (1200×630) per landssida + hem — satori + resvg vid bygge.
 *
 * Mall (CAVOK): paper-bakgrund; wordmark uppe vänster; två-tons-fråge-H1
 * (landsnamn i accent); höger tredjedel = rundad crop av landets RIKTIGA
 * zonkarta (public/static-maps/, konverteras webp→png via sharp — satori
 * saknar webp-stöd); botten: cirkelflagga + verifierad-datum + fyrfärgs
 * zon-mikrostrip som varumärkesfingeravtryck.
 *
 * Typsnitt: statiska woff ur @fontsource/manrope + @fontsource/inter
 * (satori läser TTF/OTF/WOFF — INTE woff2). Latin+latin-ext+grekiska+
 * kyrilliska täcker alla 27 språk.
 *
 * Ut: public/og/{lang}/{slug}.png + public/og/home.jpg
 * Körs som separat steg (INTE i astro build): node scripts/og-images.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';

const ROOT = process.cwd();
const OUT = join(ROOT, 'public', 'og');

// ── Data (ren Node — ingen TS-import) ───────────────────────────────────────
const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
const countriesFile = existsSync(join(ROOT, 'data/live/countries.json'))
  ? readJson('data/live/countries.json')
  : readJson('data/snapshots/countries.json');
const slugs = readJson('data/slugs.json');
const strings = readJson('data/web-strings/web_strings.json');

const countries = countriesFile.countries.filter((c) => c.isoCode !== 'OTHER');
const brandFor = (() => {
  const m = {};
  for (const c of countries) if (!m[c.languageCode]) m[c.languageCode] = c.appName;
  return (lang) => m[lang] ?? 'DroneKoll';
})();
const t = (key, lang) => strings[key]?.[lang] ?? strings[key]?.en ?? key;

// ── Typsnitt ────────────────────────────────────────────────────────────────
function font(pkg, file) {
  return readFileSync(join(ROOT, 'node_modules', pkg, 'files', file));
}
// ⚠️ Satori DEDUPLICERAR fonter på (namn, vikt, stil) — flera subset-blobbar
// under samma namn ⇒ bara den första används och grekiska/kyrilliska blev
// NO GLYPH-boxar (upptäckt 2026-07-10, fanns osedd i ursprungliga 207-setet).
// Fix: unikt namn per subset + explicita stackar (MANROPE/INTER nedan) så
// varje skriftsystem träffar rätt familj i rätt vikt.
const FONTS = [
  { name: 'Manrope', data: font('@fontsource/manrope', 'manrope-latin-700-normal.woff'), weight: 700, style: 'normal' },
  { name: 'Manrope Latin Ext', data: font('@fontsource/manrope', 'manrope-latin-ext-700-normal.woff'), weight: 700, style: 'normal' },
  { name: 'Manrope Greek', data: font('@fontsource/manrope', 'manrope-greek-700-normal.woff'), weight: 700, style: 'normal' },
  { name: 'Manrope Cyr', data: font('@fontsource/manrope', 'manrope-cyrillic-700-normal.woff'), weight: 700, style: 'normal' },
  { name: 'Inter', data: font('@fontsource/inter', 'inter-latin-500-normal.woff'), weight: 500, style: 'normal' },
  { name: 'Inter Latin Ext', data: font('@fontsource/inter', 'inter-latin-ext-500-normal.woff'), weight: 500, style: 'normal' },
  { name: 'Inter Greek', data: font('@fontsource/inter', 'inter-greek-500-normal.woff'), weight: 500, style: 'normal' },
  { name: 'Inter Cyr', data: font('@fontsource/inter', 'inter-cyrillic-500-normal.woff'), weight: 500, style: 'normal' },
];
const MANROPE = 'Manrope, Manrope Latin Ext, Manrope Greek, Manrope Cyr';
const INTER = 'Inter, Inter Latin Ext, Inter Greek, Inter Cyr';

// ── Bild-hjälpare ───────────────────────────────────────────────────────────
const svgDataUri = (path) =>
  `data:image/svg+xml;base64,${readFileSync(path).toString('base64')}`;

async function mapPngUri(iso) {
  const src = join(ROOT, 'public', 'static-maps', `${iso.toLowerCase()}.webp`);
  if (!existsSync(src)) return null;
  const buf = await sharp(src).resize(420, 502, { fit: 'cover' }).png().toBuffer();
  return `data:image/png;base64,${buf.toString('base64')}`;
}

const GLYPH = svgDataUri(join(ROOT, 'public', 'favicon.svg'));
const flagUri = (iso) => {
  const p = join(ROOT, 'public', 'flags', `${iso.toLowerCase()}.svg`);
  return existsSync(p) ? svgDataUri(p) : null;
};

// Zonfärgs-mikrostrip — varumärkesfingeravtrycket
const ZONE_STRIP = ['#FF5252', '#FFAB40', '#40C4FF', '#7C4DFF'];

// ── Mall ────────────────────────────────────────────────────────────────────
function el(type, props, ...children) {
  return { type, props: { ...props, children: children.length === 1 ? children[0] : children } };
}

function ogTree({ brand, h1Pre, accent, h1Post, caption, flag, map }) {
  return el(
    'div',
    { style: { width: 1200, height: 630, display: 'flex', background: '#FFFFFF', padding: 56, fontFamily: INTER } },
    el(
      'div',
      { style: { display: 'flex', flexDirection: 'column', flex: 1, paddingRight: 40, justifyContent: 'space-between' } },
      // Wordmark
      el(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: 14 } },
        el('img', { src: GLYPH, width: 44, height: 44, style: { borderRadius: 12 } }),
        el('div', { style: { fontFamily: MANROPE, fontSize: 30, fontWeight: 700, color: '#1D1D1F', letterSpacing: -0.6 } }, brand),
      ),
      // Två-tons-H1
      el(
        'div',
        { style: { display: 'flex', flexDirection: 'column', fontFamily: MANROPE, fontSize: 58, fontWeight: 700, color: '#1D1D1F', lineHeight: 1.14, letterSpacing: -1.2 } },
        el('div', { style: { display: 'flex', flexWrap: 'wrap' } },
          el('span', {}, h1Pre),
        ),
        el('div', { style: { display: 'flex', flexWrap: 'wrap' } },
          el('span', { style: { color: '#0277BD' } }, accent),
          el('span', {}, h1Post),
        ),
      ),
      // Botten: flagga + caption + zonstrip
      el(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: 18 } },
        ...(flag ? [el('img', { src: flag, width: 44, height: 44 })] : []),
        el('div', { style: { fontSize: 22, color: '#5F646D', display: 'flex' } }, caption),
        el(
          'div',
          { style: { display: 'flex', gap: 6, marginLeft: 'auto' } },
          ...ZONE_STRIP.map((c) =>
            el('div', { style: { width: 26, height: 10, borderRadius: 5, background: c, display: 'flex' } }),
          ),
        ),
      ),
    ),
    // Höger: riktig zonkarta i rundad ram
    ...(map
      ? [
          el(
            'div',
            { style: { display: 'flex', width: 424, height: 506, borderRadius: 24, overflow: 'hidden', border: '2px solid #E3E6EB', alignSelf: 'center' } },
            el('img', { src: map, width: 420, height: 502 }),
          ),
        ]
      : []),
  );
}

async function render(tree, outPath) {
  const svg = await satori(tree, { width: 1200, height: 630, fonts: FONTS });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
  // JPEG — rätt format för kartinnehåll (~4× mindre än PNG, og:image-ok)
  const jpg = await sharp(png).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  writeFileSync(outPath, jpg);
  return jpg.length;
}

// ── Kör ─────────────────────────────────────────────────────────────────────
const year = new Date().getFullYear();
let made = 0;
let bytes = 0;

for (const c of countries) {
  const iso = c.isoCode.toUpperCase();
  const s = slugs[iso];
  if (!s || typeof s === 'string') continue;
  const flag = flagUri(iso);
  const map = await mapPngUri(iso);

  const variants =
    c.languageCode === 'en'
      ? [{ lang: 'en', slug: s.en.slug, name: s.en.name }]
      : [
          { lang: 'en', slug: s.en.slug, name: s.en.name },
          { lang: c.languageCode, slug: s.local.slug, name: s.local.name },
        ];

  for (const v of variants) {
    const tpl = t('hero.h1.country', v.lang);
    const [pre, post = ''] = tpl.split('{country}');
    const caption = c.lastVerified
      ? t('freshness.updated', v.lang).replace('{date}', c.lastVerified)
      : `${brandFor(v.lang)} · ${year}`;
    const dir = join(OUT, v.lang);
    mkdirSync(dir, { recursive: true });
    bytes += await render(
      ogTree({
        brand: brandFor(v.lang),
        h1Pre: pre.trim(),
        accent: v.name,
        h1Post: post.replace(/^\?/, '?'),
        caption,
        flag,
        map,
      }),
      join(dir, `${v.slug}.jpg`),
    );
    made++;
  }
}

// Matris-OG:er — en per (språk × land) utanför native+en-paret (~1387 st).
// Samma CAVOK-mall som huvudloopen; landsnamnet ur data/slugs-matrix.json
// (lokaliserat namn + lokaliserad slug — icke-latinska språk har en-slug
// men native-skript-namn, precis som sidorna). Fonterna täcker latin+ext,
// grekiska och kyrilliska. Körs efter huvudloopen så kartcrop-cachen är varm.
const matrix = JSON.parse(readFileSync(join(ROOT, 'data', 'slugs-matrix.json'), 'utf8'));
let matrixMade = 0;
for (const c of countries) {
  const iso = c.isoCode.toUpperCase();
  const cell = matrix[iso];
  if (!cell) continue;
  const flag = flagUri(iso);
  const map = await mapPngUri(iso);

  for (const [lang, entry] of Object.entries(cell)) {
    // native + en renderas redan av huvudloopen (slugs.json)
    if (lang === 'en' || lang === c.languageCode) continue;
    if (!entry?.slug || !entry?.name) continue;
    const tpl = t('hero.h1.country', lang);
    const [pre, post = ''] = tpl.split('{country}');
    const caption = c.lastVerified
      ? t('freshness.updated', lang).replace('{date}', c.lastVerified)
      : `${brandFor(lang)} · ${year}`;
    const dir = join(OUT, lang);
    mkdirSync(dir, { recursive: true });
    bytes += await render(
      ogTree({
        brand: brandFor(lang),
        h1Pre: pre.trim(),
        accent: entry.name,
        h1Post: post.replace(/^\?/, '?'),
        caption,
        flag,
        map,
      }),
      join(dir, `${entry.slug}.jpg`),
    );
    made++;
    matrixMade++;
  }
}
console.log(`  … varav ${matrixMade} matris-celler`);

// Feature-OG:er — enhetsbild i högerspalten istället för karta
const featureDefs = JSON.parse(readFileSync(join(ROOT, 'data', 'feature-slugs.json'), 'utf8'));
const featStrings = JSON.parse(readFileSync(join(ROOT, 'data', 'feature-strings.json'), 'utf8'));
const ft = (key, lang) => featStrings[key]?.[lang] ?? featStrings[key]?.en ?? key;
const LANGS = [...new Set(countries.map((c) => c.languageCode))];

async function devicePngUri(feature, lang) {
  const src = join(ROOT, 'public', 'device', feature, `${lang}.webp`);
  if (!existsSync(src)) return null;
  const buf = await sharp(src)
    .resize(420, 502, { fit: 'contain', background: '#FFFFFF' })
    .png()
    .toBuffer();
  return `data:image/png;base64,${buf.toString('base64')}`;
}

for (const feature of Object.keys(featureDefs).filter((k) => !k.startsWith('_'))) {
  for (const lang of LANGS) {
    const dir = join(OUT, lang);
    mkdirSync(dir, { recursive: true });
    bytes += await render(
      ogTree({
        brand: brandFor(lang),
        h1Pre: ft(`feat.${feature}.h1.pre`, lang),
        accent: ft(`feat.${feature}.h1.accent`, lang),
        h1Post: '',
        caption: ft(`feat.${feature}.name`, lang),
        flag: null,
        map: await devicePngUri(feature, lang),
      }),
      join(dir, `app-${feature}.jpg`),
    );
    made++;
  }
}

// Hem-OG (marketing-registret: grön accent)
mkdirSync(OUT, { recursive: true });
bytes += await render(
  ogTree({
    brand: 'DroneKoll',
    h1Pre: t('home.h1.pre', 'en'),
    accent: t('home.h1.accent', 'en'),
    h1Post: '',
    caption: `${countries.length} countries · updated daily`,
    flag: null,
    map: await mapPngUri('NL'),
  }),
  join(OUT, 'home.jpg'),
);
made++;

console.log(`✓ ${made} OG-bilder, ${(bytes / 1_000_000).toFixed(1)} MB → public/og/`);
