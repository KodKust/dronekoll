/**
 * Sidmodellen: bygger hela sajtens sidinventarie ur countries + slugs.json.
 * Äger routing (Astro i18n används EJ — lokaliserade slugs skiljer sig per
 * språk), hreflang-kluster och varumärke-per-språk.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadCountries, englishContent, translatedContent } from './ingest';
import { SlugsFileSchema } from './schema';
import type { Country } from './schema';

export const SITE = 'https://dronekoll.com';

/** Appens 27 språk med nativt visningsnamn (språkväxlaren). */
export const LANGUAGES: Record<string, string> = {
  bg: 'Български',
  cs: 'Čeština',
  da: 'Dansk',
  de: 'Deutsch',
  el: 'Ελληνικά',
  en: 'English',
  es: 'Español',
  et: 'Eesti',
  fi: 'Suomi',
  fr: 'Français',
  hr: 'Hrvatski',
  hu: 'Magyar',
  is: 'Íslenska',
  it: 'Italiano',
  lt: 'Lietuvių',
  lv: 'Latviešu',
  mt: 'Malti',
  nl: 'Nederlands',
  no: 'Norsk',
  pl: 'Polski',
  pt: 'Português',
  ro: 'Română',
  sk: 'Slovenčina',
  sl: 'Slovenščina',
  sv: 'Svenska',
  tr: 'Türkçe',
  uk: 'Українська',
};
export const LANGUAGE_CODES = Object.keys(LANGUAGES);

export interface SlugPair {
  slug: string;
  name: string;
}
export interface SlugEntry {
  en: SlugPair;
  local: SlugPair;
}

let _slugs: Record<string, SlugEntry> | null = null;
export function loadSlugs(): Record<string, SlugEntry> {
  if (_slugs) return _slugs;
  const raw = JSON.parse(readFileSync(join(process.cwd(), 'data', 'slugs.json'), 'utf8'));
  const parsed = SlugsFileSchema.parse(raw);
  const out: Record<string, SlugEntry> = {};
  for (const [iso, entry] of Object.entries(parsed)) {
    if (iso.startsWith('_') || typeof entry === 'string') continue; // _comment
    out[iso] = entry as SlugEntry;
  }
  _slugs = out;
  return out;
}

/** Matris-slugs (data/slugs-matrix.json) — genererade celler (icke-en, icke-native). */
let _slugMatrix: Record<string, Record<string, SlugPair>> | null = null;
function loadSlugMatrix(): Record<string, Record<string, SlugPair>> {
  if (_slugMatrix) return _slugMatrix;
  const p = join(process.cwd(), 'data', 'slugs-matrix.json');
  _slugMatrix = {};
  if (existsSync(p)) {
    const raw = JSON.parse(readFileSync(p, 'utf8'));
    for (const [iso, byLang] of Object.entries(raw)) {
      if (iso.startsWith('_')) continue;
      _slugMatrix[iso] = byLang as Record<string, SlugPair>;
    }
  }
  return _slugMatrix;
}

/** slug + visningsnamn för (land, språk): slugs.json (en/native, fryst) → matris. */
function slugFor(iso: string, lang: string, country: Country): SlugPair | null {
  const s = loadSlugs()[iso];
  if (!s) return null;
  if (lang === 'en') return s.en;
  if (lang === country.languageCode) return s.local;
  return loadSlugMatrix()[iso]?.[lang] ?? null;
}

export interface Alternate {
  hreflang: string;
  href: string;
}

export interface PageEntry {
  iso: string;
  lang: string; // sidans språk
  slug: string;
  urlPath: string; // "/nl/nederland/"
  isLocalLang: boolean; // false = EN-sidan för ett icke-EN-land
  displayName: string; // landsnamn på sidans språk
  cluster: Alternate[]; // hreflang-kluster inkl. självreferens + x-default
  country: Country; // innehåll PÅ SIDANS SPRÅK (EN-overlay tillämpad för EN-sidor)
}

/** Lokaliserat varumärke per språk (appName ur countries.json; en → DroneKoll). */
let _brands: Record<string, string> | null = null;
export function brandForLang(lang: string): string {
  if (!_brands) {
    _brands = {};
    for (const c of loadCountries()) {
      if (!_brands[c.languageCode]) _brands[c.languageCode] = c.appName;
    }
  }
  return _brands[lang] ?? 'DroneKoll';
}

function countryUrl(lang: string, slug: string): string {
  return `/${lang}/${slug}/`;
}

let _pages: PageEntry[] | null = null;
/**
 * Alla landssidor — MATRISEN (it4): en sida per (land × språk) DÄR innehåll finns.
 * native (countries.json) + en (en-overlay) alltid; övriga språk ENDAST om en
 * översatt overlay finns (aldrig blandspråk). Fullt fylld: 55 × 27 = 1 485 sidor.
 */
export function allCountryPages(): PageEntry[] {
  if (_pages) return _pages;

  // Pass 1: samla alla celler som HAR innehåll (iso, lang, slug, name, country)
  interface Cell {
    iso: string;
    lang: string;
    slug: string;
    name: string;
    isLocalLang: boolean;
    country: Country;
  }
  const cells: Cell[] = [];
  const clusterByIso = new Map<string, Alternate[]>();

  for (const country of loadCountries()) {
    const iso = country.isoCode.toUpperCase();
    if (!loadSlugs()[iso]) {
      console.warn(`⚠ ${iso} saknas i data/slugs.json — hoppas (append + granska)`);
      continue;
    }
    const isoCells: Cell[] = [];
    for (const lang of LANGUAGE_CODES) {
      let content: Country | null;
      if (lang === country.languageCode) content = country; // native
      else if (lang === 'en') content = englishContent(country); // en-overlay
      else content = translatedContent(country, lang); // matris-overlay eller null
      if (!content) continue; // ingen översättning → ingen sida (koherens)

      const sp = slugFor(iso, lang, country);
      if (!sp) continue;
      isoCells.push({
        iso,
        lang,
        slug: sp.slug,
        name: sp.name,
        isLocalLang: lang === country.languageCode,
        country: content,
      });
    }
    // Kluster: alla språk som gav en sida för landet + x-default=en
    const enCell = isoCells.find((c) => c.lang === 'en');
    const alts: Alternate[] = isoCells.map((c) => ({
      hreflang: c.lang,
      href: SITE + countryUrl(c.lang, c.slug),
    }));
    if (enCell) alts.push({ hreflang: 'x-default', href: SITE + countryUrl('en', enCell.slug) });
    clusterByIso.set(iso, alts);
    cells.push(...isoCells);
  }

  // Pass 2: materialisera med kluster
  const pages: PageEntry[] = cells.map((c) => ({
    iso: c.iso,
    lang: c.lang,
    slug: c.slug,
    urlPath: countryUrl(c.lang, c.slug),
    isLocalLang: c.isLocalLang,
    displayName: c.name,
    cluster: clusterByIso.get(c.iso)!,
    country: c.country,
  }));

  // Slug-kollisionsvakt per språk
  const seen = new Set<string>();
  for (const p of pages) {
    const key = `${p.lang}:${p.slug}`;
    if (seen.has(key)) throw new Error(`Slug-kollision: ${key}`);
    seen.add(key);
  }

  _pages = pages;
  return pages;
}

/** Länder synliga på en språkhubb: de vars lokalspråk = hubbens språk. */
export function countriesForLang(lang: string): PageEntry[] {
  return allCountryPages().filter((p) => p.lang === lang);
}

/** Hubb-kluster: alla 27 hubbar + x-default = /en/. */
export function hubCluster(): Alternate[] {
  const alts: Alternate[] = LANGUAGE_CODES.map((l) => ({
    hreflang: l,
    href: `${SITE}/${l}/`,
  }));
  alts.push({ hreflang: 'x-default', href: `${SITE}/en/` });
  return alts;
}

/* ── Feature-sidor (/{lang}/app/{slug}/) ─────────────────────────────────────
   Slugs = ENGELSKA för alla språk (produktnamnrymd; tour_tags oanvändbara som
   slugkälla — {0}-platshållare). Kluster = alla 27 språk, samma path-mönster. */

export interface FeatureDef {
  slug: string;
  order: number;
  deviceSlots: [string, string | null];
}

let _features: FeatureDef[] | null = null;
export function loadFeatures(): FeatureDef[] {
  if (_features) return _features;
  const raw = JSON.parse(
    readFileSync(join(process.cwd(), 'data', 'feature-slugs.json'), 'utf8'),
  ) as Record<string, { order: number; deviceSlots: [string, string | null] }>;
  _features = Object.entries(raw)
    .filter(([k]) => !k.startsWith('_'))
    .map(([slug, def]) => ({ slug, order: def.order, deviceSlots: def.deviceSlots }))
    .sort((a, b) => a.order - b.order);
  return _features;
}

/** hreflang-kluster för en feature-sida (samma slug alla språk) + x-default=en. */
export function featureCluster(slug: string | null): Alternate[] {
  const path = slug ? `/app/${slug}/` : '/app/';
  const alts: Alternate[] = LANGUAGE_CODES.map((l) => ({
    hreflang: l,
    href: `${SITE}/${l}${path}`,
  }));
  alts.push({ hreflang: 'x-default', href: `${SITE}/en${path}` });
  return alts;
}

/** Förväntat sidantal (verify-build): landssidor + hubbar + app-sidor + hem + 404. */
export function expectedPageCount(): { countryPages: number; total: number } {
  const countryPages = allCountryPages().length;
  const appPages = LANGUAGE_CODES.length * (1 + loadFeatures().length); // översikt + features
  return { countryPages, total: countryPages + LANGUAGE_CODES.length + appPages + 2 };
}
