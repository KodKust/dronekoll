/**
 * Egen sitemap med xhtml:link-hreflang — @astrojs/sitemap antar identiska
 * paths per språk och kan inte uttrycka /en/netherlands/ ↔ /nl/nederland/.
 * Innehåll: hem + 27 hubbar + alla landssidor, var och en med sitt kluster.
 * lastmod = landets lastVerified (hem/hubbar: utelämnas hellre än fejkas).
 */
import type { APIRoute } from 'astro';
import {
  allCountryPages,
  hubCluster,
  featureCluster,
  loadFeatures,
  LANGUAGE_CODES,
  SITE,
} from '../lib/model';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function urlEntry(loc: string, alternates: Array<{ hreflang: string; href: string }>, lastmod?: string): string {
  const alts = alternates
    .map((a) => `    <xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${esc(a.href)}"/>`)
    .join('\n');
  return [
    '  <url>',
    `    <loc>${esc(loc)}</loc>`,
    alts,
    lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
    '  </url>',
  ]
    .filter(Boolean)
    .join('\n');
}

export const GET: APIRoute = () => {
  const entries: string[] = [];

  // Hem (fristående kluster: en + x-default = sig själv)
  entries.push(
    urlEntry(`${SITE}/`, [
      { hreflang: 'en', href: `${SITE}/` },
      { hreflang: 'x-default', href: `${SITE}/` },
    ]),
  );

  // 27 hubbar — delar ett kluster
  const hubs = hubCluster();
  for (const lang of LANGUAGE_CODES) {
    entries.push(urlEntry(`${SITE}/${lang}/`, hubs));
  }

  // Landssidor — varje sida bär sitt lands kluster
  for (const page of allCountryPages()) {
    entries.push(urlEntry(SITE + page.urlPath, page.cluster, page.country.lastVerified));
  }

  // App-sidor: översikt + 4 funktioner × 27 språk (kluster = alla språk, samma slug)
  const appOverview = featureCluster(null);
  for (const lang of LANGUAGE_CODES) {
    entries.push(urlEntry(`${SITE}/${lang}/app/`, appOverview));
  }
  for (const feature of loadFeatures()) {
    const cluster = featureCluster(feature.slug);
    for (const lang of LANGUAGE_CODES) {
      entries.push(urlEntry(`${SITE}/${lang}/app/${feature.slug}/`, cluster));
    }
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...entries,
    '</urlset>',
    '',
  ].join('\n');

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
