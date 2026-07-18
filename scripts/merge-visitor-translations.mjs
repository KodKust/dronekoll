#!/usr/bin/env node
/**
 * Fas 3-merge: slår in agenternas per-språk-filer i de två katalogerna.
 *   data/_visitor_done/{lang}.json → web_strings.json (4 nycklar) + visitor-notes.json (49 ISO)
 *
 * Vakter FÖRE skrivning (avvisar hela språket vid fel — aldrig halvmergat):
 *   platshållar-set == EN · inga { } i notes · avslutande skiljetecken · längd
 *   · skriftsystem (bg/uk kyrilliska, el grekiska) · ej identisk med EN
 *
 * Idempotent: kör om utan skada. Kör: node scripts/merge-visitor-translations.mjs [--dry]
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const DONE = join(ROOT, 'data', '_visitor_done');
const WEB = join(ROOT, 'data/web-strings/web_strings.json');
const NOTES = join(ROOT, 'data/visitor-notes.json');
const DRY = process.argv.includes('--dry');

const TEMPLATE_KEYS = ['faq.q.visitor', 'faq.tpl.visitor.easa', 'faq.tpl.visitor.other', 'faq.tpl.visitor.generic'];
const CYRILLIC = /[Ѐ-ӿ]/;
const GREEK = /[Ͱ-Ͽ]/;
const ph = (s) => new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

const web = JSON.parse(readFileSync(WEB, 'utf8'));
const notes = JSON.parse(readFileSync(NOTES, 'utf8'));
const isos = Object.keys(notes).filter((k) => !k.startsWith('_'));

if (!existsSync(DONE)) { console.error('data/_visitor_done/ saknas — kör build-visitor-todo + agenterna först.'); process.exit(1); }

let merged = 0, rejected = 0, skipped = 0;
for (const f of readdirSync(DONE).filter((x) => x.endsWith('.json'))) {
  const lang = f.replace(/\.json$/, '');
  let d;
  try { d = JSON.parse(readFileSync(join(DONE, f), 'utf8')); }
  catch (e) { console.error(`✗ ${lang}: trasig JSON — ${e.message}`); rejected++; continue; }

  const problems = [];
  for (const k of TEMPLATE_KEYS) {
    const v = d.templates?.[k];
    if (!v || typeof v !== 'string' || !v.trim()) { problems.push(`${k}: saknas`); continue; }
    if (!sameSet(ph(v), ph(web[k].en))) problems.push(`${k}: platshållare [${[...ph(v)]}] ≠ EN [${[...ph(web[k].en)]}]`);
    if (v.trim() === web[k].en.trim()) problems.push(`${k}: identisk med EN`);
    if (!/[.!?]$/.test(v.trim())) problems.push(`${k}: saknar skiljetecken`);
  }
  for (const iso of isos) {
    const v = d.notes?.[iso];
    if (!v || typeof v !== 'string' || !v.trim()) { problems.push(`note ${iso}: saknas`); continue; }
    if (v.includes('{') || v.includes('}')) problems.push(`note ${iso}: innehåller { }`);
    if (!/[.!?]$/.test(v.trim())) problems.push(`note ${iso}: saknar skiljetecken`);
    if (v.length > 480) problems.push(`note ${iso}: ${v.length} tecken > 480`);
    if (v.trim() === notes[iso].en.trim()) problems.push(`note ${iso}: identisk med EN`);
  }
  const all = [...TEMPLATE_KEYS.map((k) => d.templates?.[k]), ...isos.map((i) => d.notes?.[i])].filter(Boolean).join(' ');
  if ((lang === 'bg' || lang === 'uk') && !CYRILLIC.test(all)) problems.push('ingen kyrilliska');
  if (lang === 'el' && !GREEK.test(all)) problems.push('ingen grekiska');

  if (problems.length) {
    console.error(`✗ ${lang}: AVVISAT (${problems.length} fel)`);
    problems.slice(0, 4).forEach((p) => console.error(`    ${p}`));
    if (problems.length > 4) console.error(`    … +${problems.length - 4} till`);
    rejected++;
    continue;
  }

  const before = JSON.stringify([TEMPLATE_KEYS.map((k) => web[k][lang]), isos.map((i) => notes[i][lang])]);
  for (const k of TEMPLATE_KEYS) web[k][lang] = d.templates[k];
  for (const iso of isos) notes[iso][lang] = d.notes[iso];
  const after = JSON.stringify([TEMPLATE_KEYS.map((k) => web[k][lang]), isos.map((i) => notes[i][lang])]);
  if (before === after) skipped++; else merged++;
}

if (!DRY) {
  writeFileSync(WEB, JSON.stringify(web, null, 2) + '\n');
  writeFileSync(NOTES, JSON.stringify(notes, null, 2) + '\n');
}
console.log(`${DRY ? '[DRY] ' : ''}Merge: ${merged} språk inmergade, ${skipped} oförändrade, ${rejected} avvisade.`);
process.exit(rejected > 0 ? 1 : 0);
