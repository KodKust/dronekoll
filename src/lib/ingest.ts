/**
 * Dataingest: läser data/live/ (färsk, gitignorerad) med fallback till
 * data/snapshots/ (committad), validerar med zod, exkluderar OTHER,
 * och exponerar EN-overlays (fas 6).
 *
 * Körs i Node-kontext vid `astro build` OCH från scripts/ — därför fs,
 * inte import.meta.glob.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  CountriesOuterSchema,
  CountrySchema,
  EnOverlaySchema,
  SchemaBaselineSchema,
  type Country,
  type CountriesFile,
  type EnOverlay,
  type SchemaBaseline,
} from './schema';

const ROOT = process.cwd();
const LIVE = join(ROOT, 'data', 'live');
const SNAP = join(ROOT, 'data', 'snapshots');

function readJsonWithFallback(name: string): unknown {
  for (const dir of [LIVE, SNAP]) {
    const p = join(dir, name);
    if (existsSync(p)) {
      try {
        return JSON.parse(readFileSync(p, 'utf8'));
      } catch (err) {
        console.warn(`⚠ ${p} går inte att parsa (${(err as Error).message}) — provar nästa`);
      }
    }
  }
  throw new Error(
    `Hittar varken live- eller snapshot-version av ${name}. Kör: npm run fetch-data (eller committa en snapshot).`,
  );
}

let _countries: CountriesFile | null = null;
let _other: unknown | null = null;
export function loadCountriesFile(): CountriesFile {
  if (_countries) return _countries;
  const outer = CountriesOuterSchema.parse(readJsonWithFallback('countries.json'));
  const parsed: Country[] = [];
  for (const raw of outer.countries) {
    const iso = (raw as { isoCode?: string })?.isoCode ?? '??';
    // OTHER är en pseudo-post (saknar bl.a. bbox) — valideras EJ mot landsschemat.
    if (iso === 'OTHER') {
      _other = raw;
      continue;
    }
    const res = CountrySchema.safeParse(raw);
    if (!res.success) {
      const first = res.error.issues[0];
      throw new Error(
        `countries.json: ${iso} ogiltig — ${first.path.join('.')}: ${first.message} ` +
          `(+${res.error.issues.length - 1} fler fel)`,
      );
    }
    parsed.push(res.data);
  }
  _countries = { version: outer.version, countries: parsed };
  return _countries;
}

/** Alla riktiga länder (OTHER-pseudoposten exkluderad), sorterade på isoCode. */
export function loadCountries(): Country[] {
  return loadCountriesFile().countries.sort((a, b) => a.isoCode.localeCompare(b.isoCode));
}

/** OTHER-posten (rå) — dess ENGELSKA checklista återanvänds som generisk EN-fallback. */
export function loadOtherEntry(): unknown {
  loadCountriesFile();
  return _other;
}

/** classifier_strings.json: { CTR: { title: {lang: text}, summary: {...} }, ... } */
export function loadClassifierStrings(): Record<string, unknown> {
  try {
    return readJsonWithFallback('classifier_strings.json') as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function loadSchemaBaseline(): SchemaBaseline | null {
  try {
    return SchemaBaselineSchema.parse(readJsonWithFallback('schema_baseline.json'));
  } catch {
    return null;
  }
}

/** Zonantal per land, summerat ur schema_baseline-fingerprints. */
export function zoneCountByIso(): Record<string, number> {
  const baseline = loadSchemaBaseline();
  const out: Record<string, number> = {};
  if (!baseline) return out;
  for (const feed of Object.values(baseline.feeds)) {
    const iso = feed.iso?.toUpperCase();
    const n = feed.fingerprint?.feature_count ?? 0;
    if (iso && n > 0) out[iso] = (out[iso] ?? 0) + n;
  }
  return out;
}

/** EN-overlays (src/content/en/{ISO}.json). Saknad fil → undefined. */
const EN_DIR = join(ROOT, 'src', 'content', 'en');
let _overlays: Map<string, EnOverlay> | null = null;
export function loadEnOverlays(): Map<string, EnOverlay> {
  if (_overlays) return _overlays;
  _overlays = new Map();
  if (existsSync(EN_DIR)) {
    for (const f of readdirSync(EN_DIR)) {
      if (!f.endsWith('.json')) continue;
      const iso = f.replace(/\.json$/, '').toUpperCase();
      _overlays.set(iso, EnOverlaySchema.parse(JSON.parse(readFileSync(join(EN_DIR, f), 'utf8'))));
    }
  }
  return _overlays;
}

/** Myndighetsregistret (data/regulators.json) — WP-A: riktiga namn, inte feedkällor. */
export interface RegulatorInfo {
  regulator: string;
  aviation?: string | null;
}
let _regulators: Record<string, RegulatorInfo> | null = null;
export function loadRegulators(): Record<string, RegulatorInfo> {
  if (_regulators) return _regulators;
  const p = join(ROOT, 'data', 'regulators.json');
  _regulators = {};
  if (existsSync(p)) {
    const raw = JSON.parse(readFileSync(p, 'utf8')) as Record<string, RegulatorInfo>;
    for (const [k, v] of Object.entries(raw)) {
      if (!k.startsWith('_')) _regulators[k.toUpperCase()] = v;
    }
  }
  return _regulators;
}

/** Handskrivna FAQ-guldsvar (src/content/faq-overrides/{ISO}.json) per språk. */
const FAQ_OVERRIDE_DIR = join(ROOT, 'src', 'content', 'faq-overrides');
let _faqOverrides: Map<string, Record<string, Array<{ q: string; a: string }>>> | null = null;
export function faqOverride(iso: string, lang: string): Array<{ q: string; a: string }> | null {
  if (!_faqOverrides) {
    _faqOverrides = new Map();
    if (existsSync(FAQ_OVERRIDE_DIR)) {
      for (const f of readdirSync(FAQ_OVERRIDE_DIR)) {
        if (!f.endsWith('.json')) continue;
        _faqOverrides.set(
          f.replace(/\.json$/, '').toUpperCase(),
          JSON.parse(readFileSync(join(FAQ_OVERRIDE_DIR, f), 'utf8')),
        );
      }
    }
  }
  const entry = _faqOverrides.get(iso.toUpperCase());
  const list = entry?.[lang];
  return Array.isArray(list) && list.length > 0 ? list : null;
}

/**
 * Landets innehåll på ENGELSKA: overlay-fälten ersätter de lokala.
 * Länkar behåller id/url från källan (parallella arrayer per index).
 * STRICT_EN=1 (deploy) → saknad overlay för icke-EN-land = byggfel (launch-gate).
 * Utan strict (lokal dev före fas 6) → lokalt innehåll + varning.
 */
export function englishContent(country: Country): Country {
  if (country.languageCode === 'en') return country;
  const overlay = loadEnOverlays().get(country.isoCode.toUpperCase());
  if (!overlay) {
    if (process.env.STRICT_EN === '1') {
      throw new Error(
        `EN-overlay saknas för ${country.isoCode} (src/content/en/${country.isoCode}.json). ` +
          `Kör scripts/translate_en.py — launch-gate.`,
      );
    }
    console.warn(`⚠ EN-overlay saknas för ${country.isoCode} — EN-sidan visar lokalt innehåll (dev)`);
    return country;
  }
  const f = overlay.fields;
  return {
    ...country,
    keyRules: f.keyRules ?? country.keyRules,
    importantNotes: f.importantNotes ?? country.importantNotes,
    disclaimerText: f.disclaimerText ?? country.disclaimerText,
    sectionLabelRules: f.sectionLabelRules ?? country.sectionLabelRules,
    sectionLabelPrimary: f.sectionLabelPrimary ?? country.sectionLabelPrimary,
    sectionLabelSecondary: f.sectionLabelSecondary ?? country.sectionLabelSecondary,
    linksSheetTitle: f.linksSheetTitle ?? country.linksSheetTitle,
    dronePilotCredentialName: f.dronePilotCredentialName ?? country.dronePilotCredentialName,
    primaryLinks: country.primaryLinks.map((l, i) => ({
      ...l,
      title: f.primaryLinks?.[i]?.title ?? l.title,
      description: f.primaryLinks?.[i]?.description ?? l.description,
    })),
    secondaryLinks: country.secondaryLinks.map((l, i) => ({
      ...l,
      title: f.secondaryLinks?.[i]?.title ?? l.title,
      description: f.secondaryLinks?.[i]?.description ?? l.description,
    })),
    checklist: f.checklist ?? country.checklist,
  };
}
