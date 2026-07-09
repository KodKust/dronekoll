/**
 * Web-chrome-strängar (~40 nycklar × 27 språk).
 * data/web-strings/web_strings.json: { key: { lang: text } }.
 * EN författas för hand (fas 3), övriga språk via scripts/translate_web_strings.py
 * (fas 7). Fallback-kedja: sidans språk → en → nyckelnamnet (och en räknare så
 * verify-build kan asserta 0 fallbacks efter fas 7).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

type Catalog = Record<string, Record<string, string>>;

let _catalog: Catalog | null = null;
function catalog(): Catalog {
  if (_catalog) return _catalog;
  _catalog = {};
  // web_strings (chrome) + feature-strings (app-sidorna) i samma t()-namnrymd
  for (const rel of ['data/web-strings/web_strings.json', 'data/feature-strings.json']) {
    const p = join(process.cwd(), rel);
    if (existsSync(p)) Object.assign(_catalog, JSON.parse(readFileSync(p, 'utf8')) as Catalog);
  }
  return _catalog;
}

/** Räknas per bygge; skrivs ut av verify-build (mål: 0 efter fas 7). */
export const fallbackCounter = { toEn: 0, toKey: 0 };

export function t(key: string, lang: string, params?: Record<string, string | number>): string {
  const entry = catalog()[key];
  let text = entry?.[lang];
  if (text === undefined) {
    text = entry?.en;
    if (text !== undefined) {
      if (lang !== 'en') fallbackCounter.toEn++;
    } else {
      fallbackCounter.toKey++;
      text = key;
    }
  }
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}
