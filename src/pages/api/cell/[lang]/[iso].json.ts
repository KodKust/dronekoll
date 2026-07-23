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
import type { Country, EnOverlay, LegalClaimStatus } from '../../../../lib/schema';

// v8-revision: svarsformatets egen version (bumpa vid formförändring i meta/fields/
// legalStatus). Separat från legalStatus.schemaVersion (auditdatans version,
// tools/legal/generate_countries.py). Nya nycklar är alltid tillägg — gamla
// appversioner läser bara namngivna fält och ignorerar okända rotnycklar, så en
// bump kräver ingen egen versionsgrind så länge fältet bara VÄXER.
const API_SCHEMA_VERSION = 2;

// Whitelist av vad som exponeras publikt per claim — held/proposedReplacementEn är
// interna redaktionella arbetsfält (generatorns håll-tills-omskrivning-workflow),
// inte menade för slutanvändare.
function claimStatus(c: LegalClaimStatus) {
  return {
    claimId: c.claimId,
    status: c.status,
    reviewState: c.reviewState,
    layer: c.layer ?? null,
    sources: c.sources,
    checkedAt: c.checkedAt ?? null,
    nextReviewAt: c.nextReviewAt ?? null,
  };
}

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

  // legalStatus.keyRules/importantNotes är positionellt alignade mot BASENS
  // country.keyRules/importantNotes (generatorns invariant, validerad 818/818).
  // Översättning byter aldrig ordning/antal (staleness-vakterna kräver exakt
  // längdmatchning) → samma positioner gäller merged.keyRules/importantNotes.
  // Trots det: en API-gräns litar inte blint på interna invarianter — vid
  // längdmiss utelämnas legalStatus helt hellre än att skicka fel-alignad data.
  const ls = country.legalStatus;
  const legalStatus =
    ls && ls.keyRules.length === merged.keyRules.length && ls.importantNotes.length === merged.importantNotes.length
      ? {
          schemaVersion: ls.schemaVersion,
          auditVersion: ls.auditVersion,
          pageVerified: ls.pageVerified,
          keyRules: ls.keyRules.map(claimStatus),
          importantNotes: ls.importantNotes.map(claimStatus),
          disclaimer: ls.disclaimer
            ? { claimId: ls.disclaimer.claimId, status: ls.disclaimer.status, reviewState: ls.disclaimer.reviewState }
            : null,
        }
      : null;

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
      // v8: svarsformatets version — se konstanten ovan.
      apiSchemaVersion: API_SCHEMA_VERSION,
    },
    // v8: NY rotnyckel, additiv (gamla appversioner ignorerar okända rotnycklar).
    // Per-claim käll-/granskningsstatus, positionellt alignad med fields.keyRules/
    // importantNotes. null om något inte kan garanteras alignat (se ovan).
    legalStatus,
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
