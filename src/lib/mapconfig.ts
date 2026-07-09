/**
 * Bygger kart-config-payloaden per overlay-sida: manifestets lager +
 * zonstilar (subset när lagrens zoneTypes är kända) + lokaliserade
 * zontitlar ur classifier_strings. Saknas manifest/stilar (före fas 4-körning)
 * returneras null → MapSection renderar skeleton utan hydrering.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadClassifierStrings } from './ingest';

interface LayerCfg {
  id: string;
  url: string;
  gzBytes: number;
  typeProp: string | null;
  zoneKeyDefault?: string;
  defaultOn: boolean;
  label?: string;
  zoneTypes?: string[];
  pendingFetcher?: boolean;
}

let _manifest: Record<string, { bounds: number[][]; attribution: string; layers: LayerCfg[] }> | null | undefined;
function manifest() {
  if (_manifest !== undefined) return _manifest;
  const p = join(process.cwd(), 'data', 'map-manifest.json');
  _manifest = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')).countries : null;
  return _manifest;
}

let _styles: Record<string, { fill: string; stroke: string; width: number }> | null | undefined;
function styles() {
  if (_styles !== undefined) return _styles;
  const p = join(process.cwd(), 'data', 'zone-styles.json');
  _styles = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')).styles : null;
  return _styles;
}

const FALLBACK_STYLE = { fill: 'rgba(0,188,212,0.08)', stroke: 'rgba(0,188,212,0.44)', width: 1.0 };

export function mapConfigFor(iso: string, lang: string): object | null {
  const m = manifest()?.[iso.toUpperCase()];
  if (!m) return null;

  const layers = m.layers.filter((l) => !l.pendingFetcher || urlLooksLive(l));
  if (layers.length === 0) return null;

  const allStyles = styles() ?? { DEFAULT: FALLBACK_STYLE };

  // Subset: lagrens kända zoneTypes (+ zoneKeyDefault + DEFAULT); annars allt.
  const known = new Set<string>(['DEFAULT']);
  let haveTypes = true;
  for (const l of layers) {
    if (l.zoneKeyDefault) known.add(l.zoneKeyDefault.toUpperCase());
    if (l.zoneTypes && l.zoneTypes.length > 0) {
      for (const t of l.zoneTypes) {
        const key = String(t).toUpperCase();
        known.add(key);
        known.add(key.replace(/_[A-Z]{2}$/, '')); // suffix-strippad variant
      }
    } else {
      haveTypes = false;
    }
  }
  const subset: Record<string, unknown> = {};
  const keys = haveTypes ? [...known] : Object.keys(allStyles);
  for (const k of keys) {
    if (allStyles[k]) subset[k] = allStyles[k];
  }
  if (!subset['DEFAULT']) subset['DEFAULT'] = allStyles['DEFAULT'] ?? FALLBACK_STYLE;

  // Lokaliserade zontitlar (classifier_strings: { KEY: { title: {lang: text} } })
  const classifier = loadClassifierStrings() as Record<
    string,
    { title?: Record<string, string> } | undefined
  >;
  const titles: Record<string, string> = {};
  for (const key of Object.keys(subset)) {
    const entry = classifier[key] ?? classifier[key.replace(/_[A-Z]{2}$/, '')];
    const title = entry?.title?.[lang] ?? entry?.title?.['en'];
    if (title) titles[key] = title;
  }

  return {
    bounds: m.bounds,
    attribution: m.attribution,
    layers: layers.map(({ zoneTypes: _zt, pendingFetcher: _pf, ...rest }) => rest),
    styles: subset,
    titles,
  };
}

/** pendingFetcher-lager tas med först när web-manifest bekräftat att filen finns. */
function urlLooksLive(l: LayerCfg): boolean {
  return (l.gzBytes ?? 0) > 0;
}
