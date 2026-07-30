/**
 * Landssidans <title> och meta description — mallval per datatäckning + trunkering.
 *
 * REN JS med flit (samma skäl som country-forms.mjs): scripts/verify-build.mjs
 * kör med rå node och ska kunna räkna om EXAKT samma titlar som sajten renderar
 * — vakten och koden får aldrig glida isär.
 *
 * Mallval (SEO-uppdraget 2026-07-30: sajten rankade på "drone map estonia"-
 * frågor men titlarna lovade bara regler — kartordet fanns inte):
 *   hasAirspaceOverlay → meta.title.country.map    (regelord + kartord)
 *   hasNotam           → meta.title.country.notam  (regelord + NOTAM)
 *   annars             → meta.title.country        (befintlig regel-titel)
 *
 * Trunkering (titel ≤60, desc ≤155): kandidatkedja där årtalet stryks FÖRST
 * och kartordet SIST — kartordet är det viktigaste ledet. För kartländer med
 * långa namn finns en kortform (mapShort: bara kartord + land) innan kedjan
 * ger upp och faller till bastiteln. Årtals-strykningen äter även upp ett
 * komma före {year} så "sammanställt, 2026." inte blir "sammanställt,.".
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const MAX_TITLE = 60;
export const MAX_DESC = 155;

let _ws = null;
function ws() {
  if (!_ws) {
    _ws = JSON.parse(
      readFileSync(join(process.cwd(), 'data', 'web-strings', 'web_strings.json'), 'utf8'),
    );
  }
  return _ws;
}

function tpl(key, lang) {
  const entry = ws()[key];
  return entry?.[lang] ?? entry?.en ?? null;
}

function fill(template, params) {
  let s = template;
  for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** Stryker {year} inkl. föregående mellanslag OCH ev. komma. */
function withoutYear(template) {
  return template.replace(/,?\s*\{year\}/, '');
}

/** Datatäckning → mallsvit. Samma flaggor som FAQ/CTA-gaterna använder. */
export function tierFor(country) {
  return country.hasAirspaceOverlay ? 'map' : country.hasNotam ? 'notam' : 'base';
}

/** Första kandidaten som ryms; annars den sista (kortaste) hur lång den än är. */
function pick(templates, params, max) {
  let last = null;
  for (const t of templates) {
    if (!t) continue;
    last = fill(t, params);
    if (last.length <= max) return last;
  }
  return last ?? '';
}

/**
 * params: { country, countryIn, countryGen, year, brand } (countryParams + år
 * + varumärke — anroparen bygger dem, precis som mot t() tidigare).
 */
export function buildCountryTitle(lang, tier, params) {
  const base = tpl('meta.title.country', lang);
  const chain = [];
  if (tier === 'map') {
    const full = tpl('meta.title.country.map', lang);
    const short = tpl('meta.title.country.mapShort', lang);
    chain.push(full, withoutYear(full), short, withoutYear(short));
  } else if (tier === 'notam') {
    const full = tpl('meta.title.country.notam', lang);
    chain.push(full, withoutYear(full));
  }
  chain.push(base, withoutYear(base));
  return pick(chain, params, MAX_TITLE);
}

export function buildCountryDescription(lang, tier, params) {
  const key =
    tier === 'map'
      ? 'meta.desc.country.map'
      : tier === 'notam'
        ? 'meta.desc.country.notam'
        : 'meta.desc.country';
  const full = tpl(key, lang);
  return pick([full, withoutYear(full)], params, MAX_DESC);
}
