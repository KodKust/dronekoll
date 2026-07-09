/**
 * SEO-byggare: titlar/beskrivningar (via web-strängarna) + JSON-LD.
 * Regler: dateModified = lastVerified · FAQPage ENDAST för synligt renderade
 * Q/A · SoftwareApplication utan aggregateRating tills äkta betyg hämtas.
 */
import { t } from './i18n';
import { brandForLang, SITE, type PageEntry } from './model';

export const APP_STORE_URL = 'https://apps.apple.com/app/dronekoll/id6761332194';

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
 * Templerad FAQ ur landsdata — bara frågor vars svar har äkta datainnehåll.
 * (Svaren komponeras av befintliga lokaliserade fält, inte fri AI-text.)
 */
export function buildFaq(page: PageEntry): FaqItem[] {
  const c = page.country;
  const items: FaqItem[] = [];

  if (c.dronePilotCredentialName) {
    items.push({
      q: t('faq.q.credential', page.lang, { country: page.displayName }),
      a: c.dronePilotCredentialName + (c.regulatoryBase ? ` — ${c.regulatoryBase}` : ''),
    });
  }
  if (c.keyRules.length > 0) {
    items.push({
      q: t('faq.q.rules', page.lang, { country: page.displayName }),
      a: c.keyRules.slice(0, 5).join(' · '),
    });
  }
  if (c.importantNotes.length > 0) {
    items.push({
      q: t('faq.q.zones', page.lang, { country: page.displayName }),
      a: c.importantNotes.slice(0, 3).join(' · '),
    });
  }
  if (c.dataSourceName) {
    items.push({
      q: t('faq.q.authority', page.lang, { country: page.displayName }),
      a: c.dataSourceName + (c.dataSourceUrl ? ` — ${c.dataSourceUrl}` : ''),
    });
  }
  return items;
}
