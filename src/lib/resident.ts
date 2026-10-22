/**
 * Resident-celler (CH fr/it, 2026-10-22): det innehåll en BOFAST med annat
 * UI-språk än landets behöver utöver matriscellen — checklista, onboarding
 * (kort + lång), zonreglerna ur airspace_rules.json, språkade länk-URL:er
 * och myndighetskartan i rätt språkversion.
 *
 * Källa: src/content-resident/{lang}/{ISO}.json, översatt ur landets EGET
 * språk (för CH: tyska) — inte ur EN-overlayn som matrisen. Därför egen
 * färskhetsnyckel: meta.sourceHash = trunkerad sha256 över den kanoniska
 * (nyckelsorterade) JSON:en av landets native-fält i countries.json +
 * landets ISO-prefixade poster i airspace_rules.json (båda från Gist, via
 * fetch-data.mjs). Receptet speglas i scripts/build-resident-source.mjs och
 * scripts/check-resident-staleness.mjs — KORSREFERERA vid ändring.
 *
 * Stale ⇒ fälten UTELÄMNAS ur cellen (appen faller för just de delarna till
 * native), matriscellen i övrigt påverkas inte. Hellre tysk onboarding än en
 * fransk som beskriver en gammal tysk.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { loadAirspaceRules } from './ingest';
import type { Country } from './schema';

const ROOT = process.cwd();
const RESIDENT_DIR = join(ROOT, 'src', 'content-resident');

const SlideSchema = z.object({
  title: z.string(),
  body: z.string(),
  tag: z.string().optional(),
});
const RuleSchema = z.object({ rule: z.string().min(1), source: z.string() });

export const ResidentOverlaySchema = z.object({
  meta: z.object({
    sourceHash: z.string(),
    sourceLang: z.string(),
    translatedAt: z.string(),
    engine: z.enum(['manual', 'opus-5', 'opus-5-5', 'gpt-5.6']),
    reviewLevel: z.enum(['machine', 'ai_qa', 'native', 'native_legal']).nullish(),
  }),
  fields: z.object({
    checklist: z.array(z.object({ title: z.string(), items: z.array(z.string()) })).nullish(),
    onboarding: z.array(SlideSchema).nullish(),
    onboardingExtended: z.array(SlideSchema).nullish(),
    rules: z.record(z.string(), RuleSchema).nullish(),
    /** länk-id (countries.json) → språkad URL, samma värdnamn som originalet */
    links: z.record(z.string(), z.string()).nullish(),
    airspaceMapUrl: z.string().nullish(),
  }),
});
export type ResidentOverlay = z.infer<typeof ResidentOverlaySchema>;

/** Python json.dumps(sort_keys=True, separators=(",",":")) — samma kanon som
 *  staleness.ts canonical(). */
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

type Slide = { title?: string; body?: string; tag?: string | null };
type Checklist = { title?: string; items?: string[] };
type Link = { id?: string | null; url?: string };

/** Native-källan för resident-innehållet — spegel av build-resident-source.mjs
 *  residentSource(). Fältform = exakt det översättaren får och appen läser. */
export function residentSourcePayload(
  country: Country,
  rulesFile: { zones?: Record<string, { rule?: string; source?: string }> } | null,
): Record<string, unknown> {
  const c = country as unknown as Record<string, unknown>;
  const iso = country.isoCode.toUpperCase();
  const slide = (s: Slide) => ({
    title: s.title ?? '',
    body: s.body ?? '',
    ...(typeof s.tag === 'string' ? { tag: s.tag } : {}),
  });
  const rules: Record<string, { rule: string; source: string }> = {};
  const zones = rulesFile?.zones ?? {};
  for (const key of Object.keys(zones).sort()) {
    if (!key.toUpperCase().startsWith(`${iso}:`)) continue;
    const type = key.slice(key.indexOf(':') + 1).toUpperCase();
    rules[type] = { rule: zones[key].rule ?? '', source: zones[key].source ?? '' };
  }
  const links: Record<string, string> = {};
  for (const l of [...(country.primaryLinks ?? []), ...(country.secondaryLinks ?? [])] as Link[]) {
    if (l.id && l.url) links[l.id] = l.url;
  }
  return {
    checklist: ((c.checklist as Checklist[] | undefined) ?? []).map((s) => ({
      title: s.title ?? '',
      items: s.items ?? [],
    })),
    onboarding: ((c.onboarding as Slide[] | undefined) ?? []).map(slide),
    onboardingExtended: ((c.onboardingExtended as Slide[] | undefined) ?? []).map(slide),
    rules,
    links,
    airspaceMapUrl: (c.airspaceMapUrl as string | undefined) ?? '',
  };
}

export const residentHash = (payload: unknown): string =>
  createHash('sha256').update(canonical(payload), 'utf8').digest('hex').slice(0, 32);

export function expectedResidentHash(country: Country): string {
  return residentHash(residentSourcePayload(country, loadAirspaceRules()));
}

const _cache = new Map<string, Map<string, ResidentOverlay>>();
export function loadResidentOverlaysFor(lang: string): Map<string, ResidentOverlay> {
  const cached = _cache.get(lang);
  if (cached) return cached;
  const m = new Map<string, ResidentOverlay>();
  const dir = join(RESIDENT_DIR, lang);
  if (existsSync(dir)) {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.json') || f.startsWith('_')) continue;
      const iso = f.replace(/\.json$/, '').toUpperCase();
      m.set(iso, ResidentOverlaySchema.parse(JSON.parse(readFileSync(join(dir, f), 'utf8'))));
    }
  }
  _cache.set(lang, m);
  return m;
}

/** Alla (lang, ISO) som har en resident-källa — för vakter och rapporter. */
export function listResidentOverlays(): Array<{ lang: string; iso: string }> {
  const out: Array<{ lang: string; iso: string }> = [];
  if (!existsSync(RESIDENT_DIR)) return out;
  for (const lang of readdirSync(RESIDENT_DIR)) {
    const dir = join(RESIDENT_DIR, lang);
    let files: string[];
    try {
      files = readdirSync(dir);
    } catch {
      continue;
    }
    for (const f of files) {
      if (f.endsWith('.json') && !f.startsWith('_')) {
        out.push({ lang, iso: f.replace(/\.json$/, '').toUpperCase() });
      }
    }
  }
  return out;
}

export interface ResidentFields {
  checklist: Array<{ title: string; items: string[] }> | null;
  onboarding: Array<{ title: string; body: string; tag?: string }> | null;
  onboardingExtended: Array<{ title: string; body: string; tag?: string }> | null;
  rules: Record<string, { rule: string; source: string }> | null;
  links: Record<string, string>;
  airspaceMapUrl: string | null;
  translatedAt: string;
}

/**
 * Resident-fälten för (land, språk), eller null när ingen källa finns eller
 * källan är STALE (native-texten ändrad efter översättning). Språk = landets
 * eget ger aldrig något (appen har native). Loggar stale en gång per cell.
 */
const _warned = new Set<string>();
export function residentFieldsFor(country: Country, lang: string): ResidentFields | null {
  if (lang === country.languageCode) return null;
  const ov = loadResidentOverlaysFor(lang).get(country.isoCode.toUpperCase());
  if (!ov) return null;
  const expected = expectedResidentHash(country);
  if (ov.meta.sourceHash !== expected) {
    const key = `${lang}/${country.isoCode}`;
    if (!_warned.has(key)) {
      _warned.add(key);
      console.warn(
        `⚠ resident ${key}: STALE (sourceHash ${ov.meta.sourceHash.slice(0, 8)}… ≠ förväntad ${expected.slice(0, 8)}…) — fälten utelämnas ur cellen`,
      );
    }
    return null;
  }
  const f = ov.fields;
  // Strukturvakt: en lista med ANNAT antal än basen emitteras inte alls.
  // Appen parar per index vid lika antal och faller annars till basen —
  // men en halv cell (kort onboarding ur cellen, lång ur basen) hade gett
  // {0}-termen fel språk i ena listan (country_service.dart
  // currentBaseCredentialName). Hellre båda tyska än en blandad.
  const c = country as unknown as Record<string, unknown[]>;
  const sameLength = <T>(list: T[] | null | undefined, key: string): T[] | null =>
    list && list.length === (c[key]?.length ?? 0) && list.length > 0 ? list : null;
  const warnDrop = (key: string) =>
    console.warn(`⚠ resident ${lang}/${country.isoCode}: ${key} har annat antal än basen — utelämnas`);
  const onboarding = sameLength(f.onboarding, 'onboarding');
  const onboardingExtended = sameLength(f.onboardingExtended, 'onboardingExtended');
  if (f.onboarding && !onboarding) warnDrop('onboarding');
  if (f.onboardingExtended && !onboardingExtended) warnDrop('onboardingExtended');
  // Kort och lång följs åt: saknas den ena utelämnas båda (samma skäl).
  const bothOrNone = onboarding && onboardingExtended;
  const checklist =
    f.checklist &&
    f.checklist.length === (c.checklist?.length ?? 0) &&
    f.checklist.every((s, i) => s.items.length === ((c.checklist?.[i] as { items?: unknown[] })?.items?.length ?? -1))
      ? f.checklist
      : null;
  if (f.checklist && !checklist) warnDrop('checklist');
  return {
    checklist,
    onboarding: bothOrNone ? onboarding : null,
    onboardingExtended: bothOrNone ? onboardingExtended : null,
    rules: f.rules ?? null,
    links: f.links ?? {},
    airspaceMapUrl: f.airspaceMapUrl ?? null,
    translatedAt: ov.meta.translatedAt,
  };
}
