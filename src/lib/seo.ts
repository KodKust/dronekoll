/**
 * SEO-byggare: titlar/beskrivningar (via web-strängarna) + JSON-LD.
 * Regler: dateModified = lastVerified · FAQPage ENDAST för synligt renderade
 * Q/A · SoftwareApplication utan aggregateRating tills äkta betyg hämtas.
 */
import { t } from './i18n';
import { brandForLang, SITE, type PageEntry } from './model';

export const APP_STORE_URL = 'https://apps.apple.com/app/dronekoll/id6761332194';

/** WP-C: GATED tills Android-produktionssläppet — internal-spåret har ingen publik
 *  listing. FLIP: sätt till 'https://play.google.com/store/apps/details?id=se.dronarkartan.dronarkartan'
 *  när Play-releasen är live, bygg om — badgen dyker upp överallt. */
export const PLAY_STORE_URL: string | null = null;

/** Socialt bevis (data/rating.json, manuellt underhållet). */
import { readFileSync as _rfs, existsSync as _ex } from 'node:fs';
import { join as _join } from 'node:path';
export interface Rating {
  value: number;
  source: string;
  count: number | null;
}
let _rating: Rating | null | undefined;
export function loadRating(): Rating | null {
  if (_rating !== undefined) return _rating;
  const p = _join(process.cwd(), 'data', 'rating.json');
  _rating = _ex(p) ? (JSON.parse(_rfs(p, 'utf8')) as Rating) : null;
  return _rating;
}

const YEAR = new Date().getFullYear(); // daglig rebuild håller årtalet ärligt

export function countryTitle(page: PageEntry): string {
  return t('meta.title.country', page.lang, {
    country: page.displayName,
    year: YEAR,
    brand: brandForLang(page.lang),
  });
}

export function countryDescription(page: PageEntry): string {
  return t('meta.desc.country', page.lang, { country: page.displayName, year: YEAR });
}

/** BreadcrumbList: Hem → hubb → land. */
export function breadcrumbLd(page: PageEntry) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: t('bc.home', page.lang), item: `${SITE}/${page.lang}/` },
      { '@type': 'ListItem', position: 2, name: page.displayName, item: SITE + page.urlPath },
    ],
  };
}

export function webPageLd(page: PageEntry, title: string, description: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description,
    url: SITE + page.urlPath,
    inLanguage: page.lang,
    ...(page.country.lastVerified ? { dateModified: page.country.lastVerified } : {}),
    isPartOf: { '@type': 'WebSite', name: brandForLang(page.lang), url: SITE },
  };
}

export interface FaqItem {
  q: string;
  a: string;
}

/** FAQPage-schema av EXAKT de Q/A som renderas synligt på sidan. */
export function faqLd(items: FaqItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((i) => ({
      '@type': 'Question',
      name: i.q,
      acceptedAnswer: { '@type': 'Answer', text: i.a },
    })),
  };
}

export function softwareAppLd(lang: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: brandForLang(lang),
    operatingSystem: 'iOS',
    applicationCategory: 'UtilitiesApplication',
    url: APP_STORE_URL,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, // gratis att ladda ner
    // INGEN aggregateRating förrän äkta betyg pipelinas in.
  };
}

export function organizationLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'DroneKoll',
    url: SITE,
    logo: `${SITE}/favicon.svg`,
  };
}

/**
 * FAQ i tre lager (iteration 3, WP-A — Kristoffers browsergenomgång):
 *   1. Guldoverride: src/content/faq-overrides/{ISO}.json (handskrivet, t.ex. SE)
 *   2. Mänskliga meningsmallar (faq.tpl.*) + regulators.json — hela meningar,
 *      ALDRIG fältdumpar, INGA råa URL:er, ingen keyRules-dubblering
 *   3. Koherens-vakt: språk vars mallar inte översatts än (Opus-grinden) får
 *      HELENGELSK FAQ (fråga+svar) — aldrig blandspråk
 */
import { faqOverride, loadRegulators } from './ingest';

// TODO(Opus-grinden): töm när faq.tpl.* körts ×27 — då används sidans språk direkt.
const TPL_LANGS = new Set(['en', 'sv']);

/** Regelrad → mening: trimma, punktavsluta; gemener först för r2/r3 (ej akronymer). */
function ruleSentence(rule: string, lowerFirst: boolean): string {
  let s = rule.trim().replace(/[.;]\s*$/, '') + '.';
  if (lowerFirst && !/^[A-ZÅÄÖ]{2}/.test(s)) s = s.charAt(0).toLowerCase() + s.slice(1);
  return s;
}

export function buildFaq(page: PageEntry): FaqItem[] {
  const c = page.country;

  // Lager 1: guldoverride på sidans språk
  const gold = faqOverride(page.iso, page.lang);
  if (gold) return gold;

  // Lager 3: koherens — mall-språk eller helengelskt block
  const lang = TPL_LANGS.has(page.lang) ? page.lang : 'en';
  const displayName = lang === page.lang ? page.displayName : page.iso; // se nedan
  // Landsnamn: på fallback-engelska används EN-namnet ur klustret om det finns
  const enAlt = page.cluster.find((a) => a.hreflang === 'en');
  const country =
    lang === page.lang
      ? page.displayName
      : (enAlt ? decodeURIComponent(enAlt.href.split('/').filter(Boolean).pop() ?? displayName) : displayName)
          .replace(/-/g, ' ')
          .replace(/\b\w/g, (ch) => ch.toUpperCase());

  const reg = loadRegulators()[page.iso.toUpperCase()];
  const items: FaqItem[] = [];

  // 1. Behörighet/licens
  if (c.dronePilotCredentialName && reg) {
    const easa = /EASA|2019\/947/i.test(c.regulatoryBase ?? '');
    items.push({
      q: t('faq.q.credential', lang, { country }),
      a: t(easa ? 'faq.tpl.credential.easa' : 'faq.tpl.credential.other', lang, {
        country,
        credential: c.dronePilotCredentialName,
        regulator: reg.regulator,
      }),
    });
  }

  // 2. Viktigaste reglerna — SAMMANFATTNING av tre, aldrig hela listan igen
  if (c.keyRules.length >= 3) {
    items.push({
      q: t('faq.q.rules', lang, { country }),
      a: t('faq.tpl.rules.intro', lang, {
        country,
        r1: ruleSentence(c.keyRules[0], false),
        r2: ruleSentence(c.keyRules[1], true),
        r3: ruleSentence(c.keyRules[2], true),
      }),
    });
  }

  // 3. Var får jag inte flyga — prosa om zontyper, appen + officiell karta
  items.push({
    q: t('faq.q.zones', lang, { country }),
    a: t(c.hasAirspaceOverlay ? 'faq.tpl.zones.overlay' : 'faq.tpl.zones.plain', lang, {
      country,
      brand: brandForLang(lang),
    }),
  });

  // 4. Vem reglerar — regulators.json, ALDRIG dataSourceName/URL:er
  if (reg) {
    items.push({
      q: t('faq.q.authority', lang, { country }),
      a: reg.aviation
        ? t('faq.tpl.regulator.two', lang, { country, regulator: reg.regulator, aviation: reg.aviation })
        : t('faq.tpl.regulator.one', lang, { country, regulator: reg.regulator }),
    });
  }

  return items;
}
