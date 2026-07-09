#!/usr/bin/env node
/**
 * Exporterar appens zonfärgskarta → data/zone-styles.json.
 *
 * Läser Dart-switchen i dronarkartan-repots airspace_wfs_service.dart
 * (colorsForLayer, ~rad 2833–3031) och konverterar varje
 *   case 'KEY': return (const Color(0xAARRGGBB), const Color(0xAARRGGBB), W);
 * till { KEY: { fill: "rgba(...)", stroke: "rgba(...)", width: W } }.
 *
 * Körs PÅ BEGÄRAN (inte i CI) — när appen får nya zontyper:
 *   node scripts/export-zone-styles.mjs [sökväg-till-dart-fil]
 * Default-sökväg förutsätter dronarkartan-repot som syskon på samma maskin.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DART_PATH =
  process.argv[2] ??
  join(
    process.env.HOME ?? '',
    'Developer/dronarkartan/lib/services/airspace_wfs_service.dart',
  );
const OUT_PATH = join(__dirname, '..', 'data', 'zone-styles.json');

const src = readFileSync(DART_PATH, 'utf8');

// Isolera colorsForLayer-switchen så vi inte fångar andra Color()-förekomster.
const fnStart = src.indexOf('static (Color, Color, double) colorsForLayer');
if (fnStart === -1) {
  console.error('Hittar inte colorsForLayer i', DART_PATH);
  process.exit(1);
}
// Funktionens slut: första "\n  }" efter switchens "default:"-rad.
const defaultIdx = src.indexOf('default:', fnStart);
const fnEnd = src.indexOf('\n  }', defaultIdx);
const body = src.slice(fnStart, fnEnd);

function argbToRgba(hex8) {
  const v = parseInt(hex8, 16);
  const a = ((v >>> 24) & 0xff) / 255;
  const r = (v >>> 16) & 0xff;
  const g = (v >>> 8) & 0xff;
  const b = v & 0xff;
  // 2 decimaler räcker — matchar visuellt, håller filen läsbar.
  return `rgba(${r},${g},${b},${Math.round(a * 100) / 100})`;
}

// Fångar även fall-through (flera case-rader före ett return, t.ex. TSA/TRA).
const caseRe = /case\s+'([A-Z0-9_]+)'\s*:/g;
const retRe =
  /return\s*\(\s*const\s+Color\(0x([0-9A-Fa-f]{8})\)\s*,\s*const\s+Color\(0x([0-9A-Fa-f]{8})\)\s*,\s*([\d.]+)\s*\)/g;

const styles = {};
let pendingKeys = [];
let m;
const tokenRe = new RegExp(`${caseRe.source}|${retRe.source}`, 'g');
while ((m = tokenRe.exec(body)) !== null) {
  if (m[1]) {
    pendingKeys.push(m[1]);
  } else {
    const style = {
      fill: argbToRgba(m[2]),
      stroke: argbToRgba(m[3]),
      width: parseFloat(m[4]),
    };
    for (const key of pendingKeys) styles[key] = style;
    pendingKeys = [];
  }
}

// default-grenen (efter sista case) → nyckeln DEFAULT
const defaultRet = body.slice(body.indexOf('default:'));
const dm = /Color\(0x([0-9A-Fa-f]{8})\)\s*,\s*const\s+Color\(0x([0-9A-Fa-f]{8})\)\s*,\s*([\d.]+)/.exec(
  defaultRet,
);
if (dm) {
  styles.DEFAULT = {
    fill: argbToRgba(dm[1]),
    stroke: argbToRgba(dm[2]),
    width: parseFloat(dm[3]),
  };
}

const count = Object.keys(styles).length;
if (count < 80) {
  console.error(`Bara ${count} zonnycklar hittade — förväntade ~100. Avbryter.`);
  process.exit(1);
}

writeFileSync(
  OUT_PATH,
  JSON.stringify(
    {
      _source: 'dronarkartan lib/services/airspace_wfs_service.dart colorsForLayer()',
      _generated_note: 'Regenerera med: node scripts/export-zone-styles.mjs',
      styles,
    },
    null,
    2,
  ) + '\n',
);
console.log(`✓ ${count} zonstilar → ${OUT_PATH}`);
