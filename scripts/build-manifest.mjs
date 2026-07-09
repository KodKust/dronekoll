#!/usr/bin/env node
/**
 * Kartmanifest-byggare: countries.json (overlay-länder) + manifest-overrides
 * + web-manifest (gzBytes/zoneTypes, när fas 4-workflowen körts)
 * → data/map-manifest.json.
 *
 * Härledning ur countries.json (när override saknar layers/dropDerived):
 *  - airspaceSecondaryFeeds[]: { url, zoneKeyDefault, … } → ett lager per feed
 *  - pappilappi-URL:er skrivs om /airspace/X → /airspace/web/X (enhetligt
 *    namespace; web-optimize-workflowen kopierar även små filer dit)
 *  - icke-pappilappi-URL:er (Gist-raw IE m.fl.) lämnas orörda
 *  - typeProp default "_zoneType" (EU-mönstret); US-feeds använder "type"
 *    via overrides
 *
 * Körs som del av bygget (astro build läser resultatet) eller manuellt:
 *    node scripts/build-manifest.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

function readJson(rel, fallback = null) {
  const p = join(ROOT, rel);
  if (!existsSync(p)) return fallback;
  return JSON.parse(readFileSync(p, 'utf8'));
}

const countriesFile =
  readJson('data/live/countries.json') ?? readJson('data/snapshots/countries.json');
if (!countriesFile) {
  console.error('countries.json saknas — kör npm run fetch-data');
  process.exit(1);
}
const overrides = readJson('data/manifest-overrides.json', {});
const webManifest =
  readJson('data/live/web-manifest.json') ?? readJson('data/snapshots/web-manifest.json') ?? null;

const WEB_BASE = 'https://pappilappi.com/airspace/web/';

function toWebUrl(url) {
  if (!url) return null;
  const clean = url.split('?')[0];
  const m = clean.match(/^https:\/\/pappilappi\.com\/airspace\/(?:web\/)?(.+\.geojson)$/);
  return m ? WEB_BASE + m[1] : clean;
}

function deriveLayers(country) {
  const layers = [];
  const feeds = country.airspaceSecondaryFeeds ?? [];
  // Primär feed: airspaceWfsUrl när den pekar på en statisk geojson
  if (country.airspaceWfsUrl && /\.geojson(\?|$)/.test(country.airspaceWfsUrl)) {
    layers.push({
      id: `${country.isoCode.toLowerCase()}-primary`,
      url: toWebUrl(country.airspaceWfsUrl),
      typeProp: '_zoneType',
      defaultOn: true,
    });
  }
  for (const feed of feeds) {
    if (!feed.url || !/\.geojson(\?|$)/.test(feed.url)) continue;
    const url = toWebUrl(feed.url);
    const id = url.split('/').pop().replace(/\.geojson$/, '');
    layers.push({
      id,
      url,
      typeProp: '_zoneType',
      zoneKeyDefault: feed.zoneKeyDefault,
      defaultOn: layers.length === 0, // första feeden default på om ingen primär fanns
    });
  }
  return layers;
}

const manifest = {};
const warnings = [];

for (const country of countriesFile.countries) {
  if (!country.hasAirspaceOverlay || country.isoCode === 'OTHER') continue;
  const iso = country.isoCode.toUpperCase();
  const ov = overrides[iso] ?? {};

  let layers = ov.layers ?? (ov.dropDerived ? [] : deriveLayers(country));
  if (!ov.layers && ov.dropDerived) {
    warnings.push(`${iso}: dropDerived utan layers — kartan blir tom`);
  }
  if (layers.length === 0 && !ov.layers) {
    const derived = deriveLayers(country);
    if (derived.length === 0) warnings.push(`${iso}: inga härledbara lager (behöver override)`);
    layers = derived;
  }

  // Berika med gzBytes + zoneTypes ur web-manifest (finns efter fas 4-workflowen)
  layers = layers.map((l) => {
    const key = l.url?.split('/').pop();
    const wm = webManifest?.feeds?.[key];
    return {
      gzBytes: wm?.gzBytes ?? 0,
      zoneTypes: wm?.zoneTypes,
      ...l,
    };
  });

  manifest[iso] = {
    bounds: [
      [country.latMin, country.lonMin],
      [country.latMax, country.lonMax],
    ],
    attribution: ov.attribution ?? country.dataSourceName ?? '',
    layers,
  };
}

const out = join(ROOT, 'data', 'map-manifest.json');
writeFileSync(
  out,
  JSON.stringify(
    {
      _generated: 'scripts/build-manifest.mjs — countries.json + manifest-overrides.json + web-manifest.json',
      countries: manifest,
    },
    null,
    2,
  ) + '\n',
);

console.log(`✓ ${Object.keys(manifest).length} overlay-länder → data/map-manifest.json`);
for (const w of warnings) console.warn(`⚠ ${w}`);
