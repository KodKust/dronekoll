#!/usr/bin/env node
/**
 * Sträng-/notvakt — körs av verify-build.mjs (och fristående).
 *
 * t():s EN-fallback är TYST (i18n.ts): en nyckel som saknar ett språk renderar
 * engelska UTAN byggfel → blandspråk kan skeppas grönt. Denna vakt gör det till
 * ett HÅRT fel. Speglar ASSERT_PAGES-idiomet: strukturkoll alltid, men
 * 27/27-språkkompletthet hård bara under STRICT_L10N=1 (så en+sv-facit i Fas 2
 * kan förhandsgranskas; deploy.yml sätter STRICT_L10N=1 → main kräver full uppsättning).
 *
 * Kontroller:
 *   A. visitor-notes.json: giltig ISO (mot slugs.json), språk ur 27-listan,
 *      en+sv finns, inga { } (t() gör sekventiell replaceAll — brace i note
 *      dubbelsubstitueras), avslutande skiljetecken, längdtak. HÅRT alltid.
 *   B. Nya faq.*.visitor-nycklar: en+sv finns, platshållar-set per språk == EN.
 *      HÅRT alltid.
 *   C. Kompletthet 27/27 för visitor-nycklar + notes. HÅRT under STRICT_L10N.
 *   D. Skriftsystem (bg/uk kyrilliska, el grekiska) + ingen icke-EN ≥4 ord
 *      identisk med EN, för visitor-innehåll. Varning (heuristik).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STRICT = process.env.STRICT_L10N === '1';
const LANGS = [
  'bg', 'cs', 'da', 'de', 'el', 'en', 'es', 'et', 'fi', 'fr', 'hr', 'hu', 'is',
  'it', 'lt', 'lv', 'mt', 'nl', 'no', 'pl', 'pt', 'ro', 'sk', 'sl', 'sv', 'tr', 'uk',
];
const LANGSET = new Set(LANGS);
const CYRILLIC = /[Ѐ-ӿ]/;
const GREEK = /[Ͱ-Ͽ]/;
const placeholders = (s) => new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
const wordCount = (s) => s.trim().split(/\s+/).length;

export function checkWebStrings() {
  let failures = 0;
  let warnings = 0;
  const fail = (m) => { failures++; console.error(`  ✗ ${m}`); };
  const warn = (m) => { warnings++; console.error(`  ⚠ ${m}`); };

  const read = (rel) => (existsSync(join(ROOT, rel)) ? JSON.parse(readFileSync(join(ROOT, rel), 'utf8')) : null);
  const web = read('data/web-strings/web_strings.json') || {};
  const feat = read('data/feature-strings.json') || {};
  const notes = read('data/visitor-notes.json') || {};
  const slugs = read('data/slugs.json') || {};
  const validIso = new Set(Object.keys(slugs).filter((k) => !k.startsWith('_')).map((k) => k.toUpperCase()));

  // ── B+C+D: faq.*.visitor-nycklar i web_strings ────────────────────────────
  const visitorKeys = Object.keys(web).filter((k) => k === 'faq.q.visitor' || k.startsWith('faq.tpl.visitor.'));
  if (visitorKeys.length === 0) fail('Inga faq.*.visitor-nycklar hittades i web_strings.json');
  for (const key of visitorKeys) {
    const entry = web[key];
    if (!entry.en) fail(`${key}: saknar EN (facit)`);
    if (!entry.sv) fail(`${key}: saknar SV (facit)`);
    const enPh = entry.en ? placeholders(entry.en) : new Set();
    const present = Object.keys(entry).filter((l) => LANGSET.has(l));
    for (const lang of present) {
      const ph = placeholders(entry[lang]);
      if (enPh.size !== ph.size || [...enPh].some((p) => !ph.has(p))) {
        fail(`${key}.${lang}: platshållare {${[...ph]}} ≠ EN {${[...enPh]}}`);
      }
      if (lang !== 'en' && entry[lang] === entry.en && wordCount(entry.en) >= 4) {
        warn(`${key}.${lang}: identisk med EN (oöversatt?)`);
      }
      if ((lang === 'bg' || lang === 'uk') && wordCount(entry[lang]) >= 4 && !CYRILLIC.test(entry[lang])) {
        warn(`${key}.${lang}: ingen kyrilliska`);
      }
      if (lang === 'el' && wordCount(entry[lang]) >= 4 && !GREEK.test(entry[lang])) {
        warn(`${key}.${lang}: ingen grekiska`);
      }
    }
    if (present.length !== LANGS.length) {
      const miss = LANGS.filter((l) => !present.includes(l));
      (STRICT ? fail : (m) => console.log(`  ○ ${m}`))(`${key}: ${present.length}/27 språk (saknar ${miss.join(',')})`);
    }
  }

  // ── A+C+D: visitor-notes.json ─────────────────────────────────────────────
  const noteIsos = Object.keys(notes).filter((k) => !k.startsWith('_'));
  for (const iso of noteIsos) {
    if (!validIso.has(iso.toUpperCase())) fail(`visitor-notes: okänd ISO "${iso}" (ej i slugs.json)`);
    const langs = notes[iso];
    const present = Object.keys(langs).filter((l) => !l.startsWith('_'));
    for (const l of present) {
      if (!LANGSET.has(l)) { fail(`visitor-notes.${iso}: okänt språk "${l}"`); continue; }
      const txt = langs[l];
      if (typeof txt !== 'string' || !txt.trim()) { fail(`visitor-notes.${iso}.${l}: tom`); continue; }
      if (txt.includes('{') || txt.includes('}')) fail(`visitor-notes.${iso}.${l}: innehåller { } (bryter t()-substitution)`);
      if (!/[.!?]$/.test(txt.trim())) fail(`visitor-notes.${iso}.${l}: saknar avslutande skiljetecken`);
      if (txt.length > 480) fail(`visitor-notes.${iso}.${l}: för lång (${txt.length} > 480)`);
      if (l !== 'en' && txt === langs.en && wordCount(txt) >= 4) warn(`visitor-notes.${iso}.${l}: identisk med EN (oöversatt?)`);
      if ((l === 'bg' || l === 'uk') && wordCount(txt) >= 4 && !CYRILLIC.test(txt)) warn(`visitor-notes.${iso}.${l}: ingen kyrilliska`);
      if (l === 'el' && wordCount(txt) >= 4 && !GREEK.test(txt)) warn(`visitor-notes.${iso}.${l}: ingen grekiska`);
    }
    if (!langs.en) fail(`visitor-notes.${iso}: saknar EN (facit)`);
    if (!langs.sv) fail(`visitor-notes.${iso}: saknar SV (facit)`);
    if (present.length !== LANGS.length) {
      const miss = LANGS.filter((l) => !present.includes(l));
      (STRICT ? fail : (m) => console.log(`  ○ ${m}`))(`visitor-notes.${iso}: ${present.length}/27 språk (saknar ${miss.join(',')})`);
    }
  }

  const label = STRICT ? 'STRICT_L10N=1 (27/27 krävs)' : 'ej strict (kompletthet = info)';
  if (failures === 0) console.log(`✓ Sträng-/notvakt GRÖN — ${visitorKeys.length} visitor-nycklar, ${noteIsos.length} notes [${label}]${warnings ? ` (${warnings} varn.)` : ''}`);
  else console.error(`✗ Sträng-/notvakt: ${failures} fel [${label}]`);
  return failures;
}

// Fristående körning
if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(checkWebStrings() === 0 ? 0 : 1);
}
