#!/usr/bin/env node
/**
 * L10N-platshållarvakt (v8-revision avsnitt 22.2.6 / L10N-06): förbjuder att en
 * Unicode-bokstav eller siffra sitter DIREKT intill en {placeholder} i de centrala
 * strängfilerna. Det mönstret är signaturen på den systematiska buggen där
 * maskinöversättningen försökte böja ett dynamiskt värde (landsnamn, datum, tal)
 * genom att limma ett kasussuffix på platshållaren — t.ex. fi "drone{country}issa",
 * cs "v{country}u", da "sestavení{date}". Resultatet är grammatiskt trasig text på
 * skarpa sidor.
 *
 * Fail-closed på NYA träffar. Den kända backloggen (avsnitt 22:s {country}-
 * inflektionsnycklar m.fl.) ligger i ALLOWLIST med skäl — de kräver käll-
 * omstrukturering + språkmedveten regenerering (Fas 7 LANG-01..05), inte en
 * mekanisk mellanslags-patch, och spåras därför explicit i stället för att tyst
 * släckas. Nya nycklar/språk som glider in i mönstret ska däremot stoppas direkt.
 *
 * Kör: node scripts/check-l10n-placeholders.mjs  (ingår i npm run check)
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const FILES = ['data/web-strings/web_strings.json', 'data/feature-strings.json'];

// Bokstav/siffra direkt före { eller direkt efter } (Unicode-medveten).
const ADJACENT = /[\p{L}\p{N}]\{|\}[\p{L}\p{N}]/u;

// Känd backlog (Fas 7): kräver käll-omstrukturering + regenerering, inte
// symptom-patch. Nyckel → kort skäl. En träff PÅ dessa nycklar tolereras
// (rapporteras som backlog); en träff på VILKEN ANNAN nyckel som helst fäller.
const ALLOWLIST = new Map([
  ['hero.h1.country', '{country} böjs i mallen — avsnitt 22.2, kräver H1-omstruktur + regen'],
  ['faq.q.credential', '{country} böjs i frågan — avsnitt 22.2, ta bort {country} ur FAQ + regen'],
  ['faq.q.rules', '{country} böjs i frågan — avsnitt 22.2, ta bort {country} ur FAQ + regen'],
  ['faq.q.zones', '{country} böjs i frågan — avsnitt 22.2, ta bort {country} ur FAQ + regen'],
  ['faq.q.authority', '{country} böjs i frågan — avsnitt 22.2, ta bort {country} ur FAQ + regen'],
  ['faq.tpl.credential.easa', '{credential} böjs (lv) — avsnitt 22, regenerera lv'],
  ['map.load', '{n} felinflekterad (ro) — avsnitt 22, regenerera ro'],
  ['map.partial', '{total} felinflekterad (et/lv) — avsnitt 22, regenerera et/lv'],
]);

let hardFailures = 0;
const backlog = [];

for (const rel of FILES) {
  const p = join(ROOT, rel);
  if (!existsSync(p)) continue;
  const data = JSON.parse(readFileSync(p, 'utf8'));
  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith('_') || value === null || typeof value !== 'object') continue;
    const hits = [];
    for (const [lang, text] of Object.entries(value)) {
      if (typeof text === 'string' && ADJACENT.test(text)) hits.push(lang);
    }
    if (hits.length === 0) continue;
    if (ALLOWLIST.has(key)) {
      backlog.push(`  ○ ${key} [${hits.join(',')}] — ${ALLOWLIST.get(key)}`);
    } else {
      hardFailures++;
      console.error(`✗ ${rel}: "${key}" har bokstav/siffra intill {platshållare} i: ${hits.join(', ')}`);
      console.error(`   → dynamiska värden ska renderas som separat textnod / kasusneutralt (avsnitt 22.11 L10N-02).`);
    }
  }
}

if (backlog.length) {
  console.log(`L10N-platshållarvakt — känd backlog (Fas 7, tolererad):`);
  console.log(backlog.join('\n'));
}

if (hardFailures === 0) {
  console.log('\nL10N-platshållarvakt GRÖN (inga nya platshållar-limningar).');
  process.exit(0);
} else {
  console.error(`\n${hardFailures} NY platshållar-limning — lägg inte till i allowlist utan att först strukturrätta källan.`);
  process.exit(1);
}
