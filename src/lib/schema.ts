/**
 * Zod-scheman för datakällorna. Modellerar ENDAST fälten sajten konsumerar;
 * allt annat släpps igenom med .passthrough() — countries.json utvecklas för
 * appens behov och sajten får inte gå sönder på okända tillägg.
 */
import { z } from 'zod';

/** URL-fält i countries.json kan vara tom sträng (= "saknas") — normalisera till null. */
const urlish = () => z.preprocess((v) => (v === '' ? null : v), z.string().url().nullish());

export const LinkSchema = z
  .object({
    id: z.string().nullish(), // används ej av sajten
    title: z.string(),
    url: z.string().url(),
    description: z.string().nullish(),
  })
  .passthrough();

export const ChecklistSchema = z
  .object({
    title: z.string(),
    icon: z.string().nullish(),
    color: z.string().nullish(),
    items: z.array(z.string()),
  })
  .passthrough();

export const SecondaryFeedSchema = z
  .object({
    url: z.string().nullish(),
    zoneKeyDefault: z.string().nullish(),
  })
  .passthrough();

/** v8-revision: officiell källa som stödjer/motsäger en claim (subset av legal-sources.json). */
export const LegalSourceRefSchema = z
  .object({
    id: z.string(),
    url: z.string(),
    authority: z.string(),
    evidenceStrength: z.enum(['direct', 'candidate', 'dynamic']),
    checkedAt: z.string().nullish(),
  })
  .passthrough();

/** Per-claim status — positionellt alignad med respektive innehållsarray (index i
 *  keyRules[i]/importantNotes[i] motsvarar legalStatus.keyRules[i], validerat 818/818
 *  i v8-generatorn). reviewState är vad UI ska rendera på; status är källregistrets
 *  råa värde (för framtida bruk/felsökning). */
export const LegalClaimStatusSchema = z
  .object({
    claimId: z.string(),
    status: z.enum(['VERIFIED', 'PARTIAL', 'CONTRADICTED', 'OUTDATED', 'NO_OFFICIAL_SUPPORT', 'ADVISORY_NOT_LAW']),
    reviewState: z.enum(['VERIFIED', 'REWRITE_NEEDED', 'UNVERIFIED', 'ADVISORY']),
    layer: z.enum(['AVIATION_CORE', 'DYNAMIC_AIRSPACE', 'LOCAL_OR_SECTORAL']).nullish(),
    sources: z.array(LegalSourceRefSchema).default([]),
    checkedAt: z.string().nullish(),
    nextReviewAt: z.string().nullish(),
    held: z.boolean().nullish(), // över-strikt EASA-mall (folksamling/natt) hållen tills omskrivning
    proposedReplacementEn: z.string().nullish(),
  })
  .passthrough();

export const LegalChecklistStatusSchema = LegalClaimStatusSchema.extend({
  group: z.number(),
  item: z.number(),
});

/** v8-revision: käll-/proveniensrevision för landets regelinnehåll. Byggs av
 *  tools/legal/generate_countries.py ur legal-audit/data/legal-claims.json.
 *  pageVerified är alltid false — ingen sida får bära ett hel-lands "verifierad";
 *  status visas per claim/fält (REPO-P0-03). */
export const LegalStatusSchema = z
  .object({
    schemaVersion: z.number(),
    auditVersion: z.string(),
    pageVerified: z.literal(false).or(z.boolean()),
    keyRules: z.array(LegalClaimStatusSchema).default([]),
    importantNotes: z.array(LegalClaimStatusSchema).default([]),
    checklist: z.array(LegalChecklistStatusSchema).default([]),
    disclaimer: LegalClaimStatusSchema.omit({ sources: true, held: true, proposedReplacementEn: true })
      .extend({ sources: z.array(LegalSourceRefSchema).default([]) })
      .nullish(),
    removed: z
      .array(z.object({ claimId: z.string(), field: z.string(), status: z.string(), originalText: z.string(), auditNote: z.string().nullish() }))
      .nullish(),
  })
  .passthrough();

export type LegalClaimStatus = z.infer<typeof LegalClaimStatusSchema>;
export type LegalStatus = z.infer<typeof LegalStatusSchema>;

export const CountrySchema = z
  .object({
    isoCode: z.string().min(2).max(6), // "OTHER" är 5 tecken; filtreras i ingest
    appName: z.string(),
    languageCode: z.string().min(2).max(3),
    localeCodes: z.array(z.string()).nullish(),
    privacyPolicyUrl: urlish(),
    name: z.string(), // OBS blandspråkig — använd ALDRIG för slugs/visning; se data/slugs.json
    nameSwedish: z.string().nullish(),
    flagEmoji: z.string().nullish(),
    hasAirspaceOverlay: z.boolean(),
    hasNotam: z.boolean().nullish(),

    // Lokaliserade UI-etiketter (återanvänds som sektionsrubriker på sajten)
    airspaceButtonLabel: z.string().nullish(),
    linksSheetTitle: z.string().nullish(),
    verificationWord: z.string().nullish(),
    sectionLabelPrimary: z.string().nullish(),
    sectionLabelSecondary: z.string().nullish(),
    sectionLabelRules: z.string().nullish(),
    disclaimerText: z.string().nullish(),

    // Innehåll
    keyRules: z.array(z.string()).default([]),
    importantNotes: z.array(z.string()).default([]),
    dronePilotCredentialName: z.string().nullish(),
    checklist: z.array(ChecklistSchema).default([]),

    // Geo
    latMin: z.number(),
    latMax: z.number(),
    lonMin: z.number(),
    lonMax: z.number(),

    // Källor & länkar
    dataSourceName: z.string().nullish(),
    dataSourceUrl: urlish(),
    primaryLinks: z.array(LinkSchema).default([]),
    secondaryLinks: z.array(LinkSchema).default([]),

    // Luftrum (bara overlay-länder har de flesta av dessa)
    airspaceMapUrl: urlish(),
    airspaceMapLabel: z.string().nullish(),
    airspaceApiType: z.string().nullish(),
    airspaceWfsUrl: z.string().nullish(),
    airspaceLayerNames: z.unknown().nullish(),
    airspaceSecondaryFeeds: z.array(SecondaryFeedSchema).nullish(),
    overlayInfo: z.unknown().nullish(),

    // Regulatoriskt
    regulatoryBase: z.string().nullish(),
    lastVerified: z.string().optional(), // "YYYY-MM-DD"
    verifiedBy: z.string().nullish(),
    legalStatus: LegalStatusSchema.nullish(), // v8-revision — saknas i data byggd före 2026-07-23
  })
  .passthrough();

/** Yttre skalet — länder som okända värden; per-land-parse sker i ingest
 *  (OTHER-pseudoposten filtreras FÖRE validering, och fel namnger landet). */
export const CountriesOuterSchema = z
  .object({
    version: z.number(),
    countries: z.array(z.unknown()),
  })
  .passthrough();

export type Country = z.infer<typeof CountrySchema>;
export interface CountriesFile {
  version: number;
  countries: Country[];
}

/** Innehålls-overlay per språk: src/content/{lang}/{ISO}.json.
 *  EN (fas 6) + hela matrisen (it4, Opus 4.8). Samma fältform alla språk. */
export const EnOverlaySchema = z.object({
  meta: z.object({
    sourceHash: z.string(),
    sourceCountriesVersion: z.number().nullish(),
    sourceLastVerified: z.string().nullish(),
    translatedAt: z.string(),
    engine: z.enum(['deepl', 'manual', 'opus-4-8']),
    sourceLang: z.string().nullish(),
    // v8-revision L10N-04: ärlig proveniens. reviewLevel är den enda källan
    // som UI får lita på för att påstå granskningsgrad. FRÅNVARO = icke-native
    // (maskin/ai_qa). 'native'/'native_legal' kräver en mänsklig granskning som
    // projektet inte gör → check-l10n-placeholders.mjs fäller bygget om de sätts
    // (native-QA-policyn: överlova aldrig). sourceLocale/terminologyVersion bär
    // spårbarhet mot terminology.json + locale-style-guide.json.
    reviewLevel: z.enum(['machine', 'ai_qa', 'native', 'native_legal']).nullish(),
    sourceLocale: z.string().nullish(),
    terminologyVersion: z.number().nullish(),
  }),
  fields: z
    .object({
      keyRules: z.array(z.string()).nullish(),
      importantNotes: z.array(z.string()).nullish(),
      // Parallella arrayer per index — url/id förblir källans
      primaryLinks: z.array(z.object({ title: z.string(), description: z.string().optional() })).nullish(),
      secondaryLinks: z.array(z.object({ title: z.string(), description: z.string().optional() })).nullish(),
      disclaimerText: z.string().nullish(),
      sectionLabelRules: z.string().nullish(),
      sectionLabelPrimary: z.string().nullish(),
      sectionLabelSecondary: z.string().nullish(),
      linksSheetTitle: z.string().nullish(),
      dronePilotCredentialName: z.string().nullish(),
      checklist: z.array(z.object({ title: z.string(), items: z.array(z.string()) })).nullish(),
    })
    .passthrough(),
});
export type EnOverlay = z.infer<typeof EnOverlaySchema>;

/** Slug-kartan (data/slugs.json) — append-only, människogranskad. */
export const SlugEntrySchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
});
export const SlugsFileSchema = z.record(
  z.string(),
  z.union([z.string(), z.object({ en: SlugEntrySchema, local: SlugEntrySchema })]),
);

/** schema_baseline.json (pappilappi/status) — zonantal per feed. */
export const SchemaBaselineSchema = z
  .object({
    version: z.number().nullish(),
    generated: z.string().nullish(),
    feeds: z.record(
      z.string(),
      z
        .object({
          iso: z.string().nullish(),
          label: z.string().nullish(),
          fingerprint: z
            .object({
              feature_count: z.number().nullish(),
              geometry_types: z.array(z.string()).nullish(),
              property_keys: z.array(z.string()).nullish(),
            })
            .passthrough()
            .nullish(),
        })
        .passthrough(),
    ),
  })
  .passthrough();
export type SchemaBaseline = z.infer<typeof SchemaBaselineSchema>;
