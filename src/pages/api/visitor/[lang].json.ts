/**
 * Visitor-endpoint (turistläge, app-brygga): appens turistpanel hämtar
 * "får jag flyga här som utländsk besökare?" för ALLA länder på ETT språk —
 * /api/visitor/de.json = alla 55 länder, svaret på tyska.
 *
 * VARFÖR EGEN ENDPOINT och inte ett fält i /api/cell/:
 *   1. Cellen existerar per definition BARA när besökarens språk ≠ landets
 *      språk (se cell-endpointens getStaticPaths). En tysk i Österrike, en
 *      britt i Irland eller en amerikan i Kanada skulle alltså få NOLL — och
 *      det är precis när språken sammanfaller som inget annat i appen
 *      signalerar att något är annorlunda för en besökare.
 *   2. Appens _applyCell förkastar HELA cellen vid stale/antalsmiss. En
 *      redigerad keyRule hade då tyst dödat en färsk turistnot på alla språk.
 *
 * Innehållet komponeras av samma buildFaq som sidorna → appen och sajten kan
 * aldrig glida isär. Guldoverride-länder (SE) levererar sitt handskrivna svar
 * automatiskt, eftersom guldposterna bär samma id.
 *
 * 27 statiska filer à ~30 kB (~8 kB gzip). GitHub Pages sätter ETag +
 * max-age=600 → appens CachedHttpClient omvaliderar med 304.
 */
import type { APIRoute } from 'astro';
import { allCountryPages, LANGUAGE_CODES, SITE } from '../../../lib/model';
import { buildFaq } from '../../../lib/seo';
import { loadCountriesFile, loadVisitorNotes } from '../../../lib/ingest';

interface Entry {
  iso: string;
  q: string;
  a: string;
  url: string;
  /** true = landet har en researchad, landsspecifik not (inte bara EU-basen). */
  specific: boolean;
}
interface Props {
  lang: string;
  entries: Entry[];
  version: number;
}

export function getStaticPaths() {
  const version = loadCountriesFile().version;
  const notes = loadVisitorNotes();
  const byLang = new Map<string, Entry[]>();
  for (const lang of LANGUAGE_CODES) byLang.set(lang, []);

  for (const page of allCountryPages()) {
    const bucket = byLang.get(page.lang);
    if (!bucket) continue;
    // interactiveMap påverkar bara zon-frågan — irrelevant här.
    const visitor = buildFaq(page).find((i) => i.id === 'visitor');
    if (!visitor) continue;
    bucket.push({
      iso: page.iso,
      q: visitor.q,
      a: visitor.a,
      url: SITE + page.urlPath,
      specific: Boolean(notes[page.iso.toUpperCase()]?.[page.lang]),
    });
  }

  return LANGUAGE_CODES.map((lang) => ({
    params: { lang },
    props: { lang, entries: (byLang.get(lang) ?? []).sort((a, b) => a.iso.localeCompare(b.iso)), version },
  }));
}

export const GET: APIRoute = ({ props }) => {
  const { lang, entries, version } = props as Props;
  const body = {
    meta: {
      lang,
      count: entries.length,
      // Versionen sajten byggde mot (samma fält som cell-endpointen).
      siteCountriesVersion: version,
      // Hur många av länderna som har landsspecifik text (resten = EU-basen).
      specificCount: entries.filter((e) => e.specific).length,
    },
    countries: Object.fromEntries(
      entries.map((e) => [e.iso, { q: e.q, a: e.a, url: e.url, specific: e.specific }]),
    ),
  };
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
