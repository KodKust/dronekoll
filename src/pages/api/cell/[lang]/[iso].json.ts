/**
 * Cell-endpoint (turistläge): appen hämtar landets regelinnehåll på
 * BESÖKARENS språk — /api/cell/es/NL.json = Nederländerna på spanska.
 *
 * Emitterar MERGAT innehåll (samma applyOverlay som sidorna): länkar bär
 * id/url från countries.json + översatt title/description — appen slipper
 * matchningsproblemet nästan helt. Checklistan skickas RÅ ur overlayn
 * (title+items); icon/color/infoOnly ägs av appens bas och paras per index
 * i appen, endast vid lika antal sektioner.
 *
 * Native språk emitteras inte (appen har det i countries.json). EN
 * emitteras för icke-EN-länder (engelsktalande besökare).
 * ~1 430 statiska filer à ~3 kB i dist/ — GitHub Pages sätter ETag +
 * max-age=600 → appens CachedHttpClient omvaliderar med 304.
 */
import type { APIRoute } from 'astro';
import {
  englishContent,
  loadCountries,
  loadCountriesFile,
  loadOverlaysFor,
  translatedContent,
} from '../../../../lib/ingest';
import { LANGUAGE_CODES } from '../../../../lib/model';
import { isCellStale } from '../../../../lib/staleness';
import type { Country, EnOverlay } from '../../../../lib/schema';

interface CellProps {
  overlay: EnOverlay;
  merged: Country;
  country: Country;
  version: number;
}

export function getStaticPaths() {
  const version = loadCountriesFile().version;
  const paths: Array<{ params: { lang: string; iso: string }; props: CellProps }> = [];
  for (const country of loadCountries()) {
    for (const lang of LANGUAGE_CODES) {
      if (lang === country.languageCode) continue; // native = appen har redan
      const overlay = loadOverlaysFor(lang).get(country.isoCode.toUpperCase());
      if (!overlay) continue; // ingen cell → ingen fil (aldrig blandspråk)
      const merged =
        lang === 'en' ? englishContent(country) : translatedContent(country, lang);
      if (!merged) continue;
      paths.push({
        params: { lang, iso: country.isoCode },
        props: { overlay, merged, country, version },
      });
    }
  }
  return paths;
}

export const GET: APIRoute = ({ props, params }) => {
  const { overlay, merged, country, version } = props as CellProps;
  const lang = params.lang as string;
  const body = {
    meta: {
      iso: country.isoCode,
      lang,
      translatedAt: overlay.meta.translatedAt,
      engine: overlay.meta.engine,
      sourceHash: overlay.meta.sourceHash,
      // Versionen sajten faktiskt byggde mot — ersätter overlayernas
      // opålitliga sourceCountriesVersion (ofta null).
      siteCountriesVersion: version,
      // Byggtidsberäknad färskhet — appen förkastar stale celler helt.
      stale: isCellStale(overlay, country, lang),
    },
    fields: {
      keyRules: merged.keyRules,
      importantNotes: merged.importantNotes,
      primaryLinks: merged.primaryLinks.map((l) => ({
        id: l.id ?? null,
        url: l.url,
        title: l.title,
        description: l.description ?? null,
      })),
      secondaryLinks: merged.secondaryLinks.map((l) => ({
        id: l.id ?? null,
        url: l.url,
        title: l.title,
        description: l.description ?? null,
      })),
      disclaimerText: merged.disclaimerText,
      sectionLabelRules: merged.sectionLabelRules,
      sectionLabelPrimary: merged.sectionLabelPrimary,
      sectionLabelSecondary: merged.sectionLabelSecondary,
      linksSheetTitle: merged.linksSheetTitle,
      dronePilotCredentialName: merged.dronePilotCredentialName ?? null,
      checklist: overlay.fields.checklist ?? null,
    },
  };
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
