#!/usr/bin/env node
/**
 * Fas 3-staging: splittar visitor-FAQ:ns en+sv-facit till ett arbetspaket per
 * målspråk (25 st) — speglar build-matrix-todo.mjs-mönstret från it4.
 *
 *   data/_visitor_todo/{lang}.json   ← agentens input (facit + att-göra-lista)
 *   data/_visitor_todo/_INSTRUCTIONS.md ← YMYL-kontraktet (delat)
 *   data/_visitor_done/{lang}.json   ← agentens output (merge-skriptet läser)
 *
 * Gitignorerat (regenereras). Kör: node scripts/build-visitor-todo.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const TODO = join(ROOT, 'data', '_visitor_todo');
const DONE = join(ROOT, 'data', '_visitor_done');
mkdirSync(TODO, { recursive: true });
mkdirSync(DONE, { recursive: true });

const web = JSON.parse(readFileSync(join(ROOT, 'data/web-strings/web_strings.json'), 'utf8'));
const notes = JSON.parse(readFileSync(join(ROOT, 'data/visitor-notes.json'), 'utf8'));

const TEMPLATE_KEYS = ['faq.q.visitor', 'faq.tpl.visitor.easa', 'faq.tpl.visitor.other', 'faq.tpl.visitor.generic'];
const TARGETS = ['bg', 'cs', 'da', 'de', 'el', 'es', 'et', 'fi', 'fr', 'hr', 'hu', 'is', 'it',
  'lt', 'lv', 'mt', 'nl', 'no', 'pl', 'pt', 'ro', 'sk', 'sl', 'tr', 'uk'];
const isos = Object.keys(notes).filter((k) => !k.startsWith('_'));

const INSTRUCTIONS = `# Visitor-FAQ — översättningskontrakt (Fas 3)

Du översätter EN ny FAQ-fråga om **turister/utländska besökare** till ETT språk.
Källa = en+sv-facit (handförfattat, faktagranskat mot officiella myndighetskällor).

## YMYL — detta är juridisk vägledning för drönarpiloter
1. **Ändra ALDRIG fakta**: vikter (250 g, 500 g, 750 g, 2 kg, 7 kg, 20 kg), höjder
   (120 m, 45 m, 30 m, 400 ft, 200 ft), belopp (12,34 pund, 25 euro, 10 euro, 5 US-dollar,
   S$25, CHF 1 miljon, 750 000 SDR, 50 000 euro), dagar/frister (20 arbetsdagar, 14 dagar,
   30 dagar, 5 arbetsdagar, 10 dagar, 45 arbetsdagar), datum (17 maj 2026, 13 november 2025,
   1 juli 2026, 30 maj 2026, 31 oktober 2026). Siffror kopieras ORDAGRANT.
2. **Myndighets- och systemnamn översätts INTE**: EASA, NOTAM, A1/A3, A2, TRUST, DroneZone,
   Remote ID, Flyer ID, Operator ID, SFOC-RPAS, DigitalSky, eSUA, UAPass, SingPost, CAAP,
   SACAA, SHGM, GCAA, UAE Pass, SISANT, SARPAS, DECEA, ANAC, AFAC, DGAC, IDAC, AAC, MTC,
   DINACIA, Aerocivil, NOM-107, RBAC 100, RAC-RPAS, IDRONECT, DroneTower, PANSA, NSM,
   Lantmäteriet, spridningstillstånd, AAN, e-AAN, DCA, DOC, CASA, CAA, FAA, LBA, Transportstyrelsen.
   (Egennamn på platser likaså: Gullfoss, Þingvellir, Triglav, Kruger, Galápagos, Machu Picchu,
   Akropolis/Acropolis, Vaduz, Albrook.)
3. **Verdikt-styrkan måste bevaras.** "Effectively no" får INTE bli "ja, men". Länder med
   nej-verdikt (Indien, Ukraina, UAE, Mexiko) ska läsas som nej på ditt språk också.
4. Osäker på en term? Följ hur samma term redan används i ditt språks befintliga strängar.

## Så här får du terminologin gratis
Läs FÖRE du skriver:
- \`data/web-strings/web_strings.json\` → ditt språks befintliga \`faq.*\`-strängar
  (särskilt \`faq.tpl.zones.notam\`, \`faq.tpl.credential.easa\`, \`faq.tpl.regulator.two\`).
  Matcha tilltal (du/ni), meningsrytm och facktermer EXAKT.
- \`src/content/{lang}/{ISO}.json\` för de länder du översätter (t.ex. TR, MX, IN) →
  landets \`importantNotes\` finns REDAN på ditt språk. Återanvänd de termerna.

## Formregler (vakten avvisar annars)
- **Platshållare kopieras exakt**: \`{country}\`, \`{regulator}\`, \`{note}\`. Samma uppsättning
  som EN-källan, varken fler eller färre. Översätt ALDRIG platshållarnamnet.
- **Landsnoter får INTE innehålla { eller }** (de injiceras i en platshållare).
- Varje sträng avslutas med skiljetecken (. ! ?).
- Landsnoter: max 480 tecken.
- bg/uk måste skrivas med kyrilliska, el med grekiska.
- Ingen sträng får vara identisk med engelskan (då räknas den som oöversatt).

## Din output
Skriv EN fil: \`data/_visitor_done/{lang}.json\`
\`\`\`json
{ "lang": "xx",
  "templates": { "faq.q.visitor": "…", "faq.tpl.visitor.easa": "…",
                 "faq.tpl.visitor.other": "…", "faq.tpl.visitor.generic": "…" },
  "notes": { "US": "…", "CA": "…", … alla ${isos.length} ISO … } }
\`\`\`
Finns filen redan komplett (4 mallar + ${isos.length} notes) → RÖR DEN INTE, rapportera "redan klar".
Spawna ALDRIG underagenter.
`;
writeFileSync(join(TODO, '_INSTRUCTIONS.md'), INSTRUCTIONS);

const templates = {};
for (const k of TEMPLATE_KEYS) templates[k] = { en: web[k].en, sv: web[k].sv };
const noteSrc = {};
for (const iso of isos) noteSrc[iso] = { en: notes[iso].en, sv: notes[iso].sv };

let written = 0;
for (const lang of TARGETS) {
  const donePath = join(DONE, `${lang}.json`);
  let already = false;
  if (existsSync(donePath)) {
    try {
      const d = JSON.parse(readFileSync(donePath, 'utf8'));
      already = TEMPLATE_KEYS.every((k) => d.templates?.[k]) && isos.every((i) => d.notes?.[i]);
    } catch { already = false; }
  }
  writeFileSync(join(TODO, `${lang}.json`), JSON.stringify({ lang, alreadyComplete: already, templates, notes: noteSrc }, null, 2));
  written++;
}
console.log(`✓ ${written} språkpaket i data/_visitor_todo/ (${TEMPLATE_KEYS.length} mallar + ${isos.length} notes vardera)`);
