/**
 * Zonkartans baskarta = appens stil "förenklad": countries.json toppnivå
 * `mapTiles.simplified` (Gist, samma fält appen läser), bundlad fallback nedan.
 *
 * Bakgrund: CARTO började i slutet av augusti 2026 kräva API-nyckel och
 * vattenstämpla anonyma anrop ("API KEY REQUIRED" över hela kartan). Appen
 * bytte 2026-09-03 och gjorde adressen till data (dronarkartan
 * lib/models/map_tiles.dart), men zone-map.ts hade en egen hårdkodad
 * CARTO-adress som ingen sökte efter — zonkartan på varje overlay-sida bar
 * vattenstämpeln till 2026-09-30. En tredjepartsadress är data, inte kod:
 * ett leverantörsbyte i countries.json når nu både appen och sajten
 * (publish-gist → site-data-updated → ombyggnad), och data_health:s
 * baskarte-sektion provhämtar exakt de plattor sajten visar.
 */
import { loadCountriesFile } from './ingest';

export interface Basemap {
  url: string;
  /** Etikettlager ovanpå basen (Esri Light Gray är delad i Base + Reference). */
  referenceUrl: string | null;
  /** Leverantörens krediteringstext ordagrant — översätts aldrig. */
  attribution: string;
  attributionUrl: string | null;
  /** Tjänstens verkliga tak; ovanför skalar Leaflet upp i stället för att hämta tomma plattor. */
  maxNativeZoom: number;
}

const DEFAULT_MAX_NATIVE_ZOOM = 19;

/** Samma värden som appens MapTileStyle.defaults['simplified']. */
export const FALLBACK_BASEMAP: Basemap = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
  referenceUrl:
    'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
  attribution: 'Esri, HERE, Garmin, (c) OpenStreetMap contributors, and the GIS user community',
  attributionUrl: 'https://www.esri.com/en-us/legal/terms/data-attributions',
  maxNativeZoom: 16,
};

/** https + {z}/{x}/{y} — samma regel som appens MapTileStyle.isValidTemplate. */
export function isValidTileTemplate(u: unknown): u is string {
  return (
    typeof u === 'string' &&
    u.startsWith('https://') &&
    u.includes('{z}') &&
    u.includes('{x}') &&
    u.includes('{y}')
  );
}

function httpsUrlOrNull(u: unknown): string | null {
  if (typeof u !== 'string') return null;
  try {
    return new URL(u.trim()).protocol === 'https:' ? u.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Tolerant läsning. Ogiltig url ELLER saknad kreditering ⇒ hela fallbacken —
 * aldrig en ny leverantörs plattor under den gamlas kreditering.
 */
export function parseBasemap(raw: unknown): Basemap {
  if (!raw || typeof raw !== 'object') return FALLBACK_BASEMAP;
  const j = raw as Record<string, unknown>;
  const attribution = typeof j.attribution === 'string' ? j.attribution.trim() : '';
  if (!isValidTileTemplate(j.url) || !attribution) return FALLBACK_BASEMAP;
  const z = j.maxNativeZoom;
  return {
    url: j.url,
    referenceUrl: isValidTileTemplate(j.referenceUrl) ? j.referenceUrl : null,
    attribution,
    attributionUrl: httpsUrlOrNull(j.attributionUrl),
    maxNativeZoom:
      typeof z === 'number' && Number.isInteger(z) && z >= 1 && z <= 22 ? z : DEFAULT_MAX_NATIVE_ZOOM,
  };
}

let _basemap: Basemap | undefined;
export function basemap(): Basemap {
  if (_basemap) return _basemap;
  const raw = (loadCountriesFile().mapTiles as { simplified?: unknown } | undefined)?.simplified;
  _basemap = parseBasemap(raw);
  if (_basemap === FALLBACK_BASEMAP) {
    console.warn('⚠ countries.json saknar giltig mapTiles.simplified — zonkartan använder den bundlade Esri-fallbacken');
  }
  return _basemap;
}
