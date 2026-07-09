/**
 * Sidmodellen: bygger hela sajtens sidinventarie ur countries + slugs.json.
 * Äger routing (Astro i18n används EJ — lokaliserade slugs skiljer sig per
 * språk), hreflang-kluster och varumärke-per-språk.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadCountries, englishContent } from './ingest';
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

/** hreflang-kluster för ett land: lokal ↔ en + x-default=en. */
function clusterFor(iso: string, country: Country): Alternate[] {
  const slugs = loadSlugs()[iso];
  const enHref = SITE + countryUrl('en', slugs.en.slug);
  const alts: Alternate[] = [{ hreflang: 'en', href: enHref }];
  if (country.languageCode !== 'en') {
    alts.push({
      hreflang: country.languageCode,
      href: SITE + countryUrl(country.languageCode, slugs.local.slug),
    });
  }
  alts.push({ hreflang: 'x-default', href: enHref });
  return alts;
}

let _pages: PageEntry[] | null = null;
/** Alla landssidor (~98 st: 55 EN + 43 lokalspråk). */
export function allCountryPages(): PageEntry[] {
  if (_pages) return _pages;
  const slugs = loadSlugs();
  const pages: PageEntry[] = [];

  for (const country of loadCountries()) {
    const iso = country.isoCode.toUpperCase();
    const s = slugs[iso];
    if (!s) {
      // Nytt land utan granskad slug-post → hoppa sidan, mynta ALDRIG auto-slug.
      console.warn(`⚠ ${iso} saknas i data/slugs.json — landssidan hoppas (append + granska)`);
      continue;
    }
    const cluster = clusterFor(iso, country);

    // EN-sidan (alla länder)
    pages.push({
      iso,
      lang: 'en',
      slug: s.en.slug,
      urlPath: countryUrl('en', s.en.slug),
      isLocalLang: country.languageCode === 'en',
      displayName: s.en.name,
      cluster,
      country: englishContent(country),
    });

    // Lokalspråkssidan (icke-EN-länder)
    if (country.languageCode !== 'en') {
      pages.push({
        iso,
        lang: country.languageCode,
        slug: s.local.slug,
        urlPath: countryUrl(country.languageCode, s.local.slug),
        isLocalLang: true,
        displayName: s.local.name,
        cluster,
        country,
      });
    }
  }

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

/** Förväntat sidantal (verify-build): landssidor + 27 hubbar + hem + 404. */
export function expectedPageCount(): { countryPages: number; total: number } {
  const countryPages = allCountryPages().length;
  return { countryPages, total: countryPages + LANGUAGE_CODES.length + 2 };
}
