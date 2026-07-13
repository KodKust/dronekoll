/**
 * Cell-färskhet för app-endpointen /api/cell/{lang}/{iso}.json (turistläge).
 *
 * Tre recept, spegel av respektive producent — KORSREFERERA vid ändring:
 *  1. Matriscell, icke-EN-land: cellen översattes från EN-overlayn
 *     (scripts/build-matrix-source.mjs) → förväntad hash = EN-overlayns
 *     meta.sourceHash, ren strängjämförelse.
 *  2. Matriscell, EN-nativt land: cellen översattes direkt ur countries.json
 *     → trunkerad sha256(JSON.stringify(fields)) — exakt fältuppsättning och
 *     ordning som build-matrix-source.mjs fieldsFromCountry().
 *  3. EN-cell (lang='en', icke-EN-land): EN-overlayn själv — förväntad hash =
 *     python-kanonisk hash av källfälten i countries.json (recept =
 *     translate_en.py:s source_payload, dupliceringen etablerad i
 *     scripts/check-en-staleness.mjs).
 *
 * En stale cell SKEPPAS (graciös degradering på sajten) men flaggas i
 * endpointens meta.stale — appen förkastar då cellen och visar native
 * (hellre helnative än halvgammal översättning).
 */
import { createHash } from 'node:crypto';
import type { Country, EnOverlay } from './schema';
import { loadEnOverlays } from './ingest';

const STRING_FIELDS = [
  'disclaimerText',
  'sectionLabelRules',
  'sectionLabelPrimary',
  'sectionLabelSecondary',
  'linksSheetTitle',
  'dronePilotCredentialName',
] as const;
const LIST_FIELDS = ['keyRules', 'importantNotes'] as const;

type FieldsPayload = Record<string, unknown>;

/** Spegel av build-matrix-source.mjs fieldsFromCountry() — ändra ej ensam. */
function fieldsFromCountry(c: Country): FieldsPayload {
  const f: FieldsPayload = {};
  for (const k of STRING_FIELDS) if (c[k]) f[k] = c[k];
  for (const k of LIST_FIELDS) f[k] = c[k] ?? [];
  f.primaryLinks = (c.primaryLinks ?? []).map((l) => ({
    title: l.title ?? '',
    description: l.description ?? '',
  }));
  f.secondaryLinks = (c.secondaryLinks ?? []).map((l) => ({
    title: l.title ?? '',
    description: l.description ?? '',
  }));
  return f;
}

const matrixHash = (obj: unknown): string =>
  createHash('sha256').update(JSON.stringify(obj), 'utf8').digest('hex').slice(0, 32);

/** Python json.dumps(sort_keys=True, separators=(",",":")) — spegel av
 *  check-en-staleness.mjs canonical(). */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(record[k])}`).join(',')}}`;
  }
  if (value === undefined) return 'null';
  return JSON.stringify(value);
}

/** Spegel av translate_en.py:s source_payload (via check-en-staleness.mjs). */
function enSourcePayload(c: Country): FieldsPayload {
  const payload: FieldsPayload = {};
  for (const k of STRING_FIELDS) if (c[k]) payload[k] = c[k];
  for (const k of LIST_FIELDS) payload[k] = c[k] ?? [];
  payload.primaryLinks = (c.primaryLinks ?? []).map((l) => ({
    title: l.title ?? '',
    description: l.description ?? '',
  }));
  payload.secondaryLinks = (c.secondaryLinks ?? []).map((l) => ({
    title: l.title ?? '',
    description: l.description ?? '',
  }));
  return payload;
}

const enHash = (c: Country): string =>
  createHash('sha256').update(canonical(enSourcePayload(c)), 'utf8').digest('hex');

/**
 * Förväntad meta.sourceHash för cellen (land × lang). null = kan inte
 * beräknas (t.ex. EN-overlay saknas) → behandla som färsk, aldrig falsklarm.
 */
export function expectedCellSourceHash(country: Country, lang: string): string | null {
  if (lang === 'en') {
    // EN-cellen är själva EN-overlayn — dess källa är countries.json direkt.
    return enHash(country);
  }
  if (country.languageCode !== 'en') {
    return loadEnOverlays().get(country.isoCode.toUpperCase())?.meta.sourceHash ?? null;
  }
  return matrixHash(fieldsFromCountry(country));
}

/** true = cellens källa har ändrats efter översättning → appen ska falla
 *  tillbaka på native. Okänd förväntan → false (aldrig falskt larm). */
export function isCellStale(overlay: EnOverlay, country: Country, lang: string): boolean {
  const expected = expectedCellSourceHash(country, lang);
  return expected !== null && overlay.meta.sourceHash !== expected;
}
