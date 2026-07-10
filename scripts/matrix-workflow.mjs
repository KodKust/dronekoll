export const meta = {
  name: 'dronekoll-matrix-translate',
  description: 'Översätt landsinnehåll till 26 språk (strypt 3 åt gången, idempotent)',
  phases: [{ title: 'Översätt', detail: '26 språk × ~54 länder, 3 samtidigt' }],
};

// Alla 26 målspråk (de klar = pilot). Chunkas 3 åt gången för att undvika
// server-rate-limit. Varje agent hoppar språk som redan är komplett på disk.
const LANGS = [
  { c: 'sv', n: 'svenska', note: "Kristoffers eget språk — extra noggrann, naturlig svenska, 'drönare/drönarkort', inga danismer." },
  { c: 'fr', n: 'franska', note: "'vous', télépilote." },
  { c: 'es', n: 'spanska', note: "neutral ES+LatAm, 'tú'." },
  { c: 'it', n: 'italienska', note: '' },
  { c: 'nl', n: 'nederländska', note: "'je'." },
  { c: 'pt', n: 'portugisiska', note: 'europeisk/neutral.' },
  { c: 'pl', n: 'polska', note: 'korrekt kasus.' },
  { c: 'da', n: 'danska', note: 'ej svenska calques.' },
  { c: 'no', n: 'norska (bokmål)', note: '' },
  { c: 'fi', n: 'finska', note: 'korrekt kasusböjning.' },
  { c: 'cs', n: 'tjeckiska', note: 'korrekt kasus.' },
  { c: 'sk', n: 'slovakiska', note: '' },
  { c: 'ro', n: 'rumänska', note: 'ș/ț.' },
  { c: 'hu', n: 'ungerska', note: 'agglutination.' },
  { c: 'el', n: 'grekiska', note: 'grekiskt alfabet; latinska myndighetsnamn kvar.' },
  { c: 'bg', n: 'bulgariska', note: 'kyrilliska.' },
  { c: 'uk', n: 'ukrainska', note: 'kyrilliska, ej ryska calques.' },
  { c: 'hr', n: 'kroatiska', note: 'DeepL saknar → enda källan, extra kvalitet.' },
  { c: 'sl', n: 'slovenska', note: '' },
  { c: 'is', n: 'isländska', note: 'DeepL saknar → enda källan, korrekt kasus/genus.' },
  { c: 'mt', n: 'maltesiska', note: 'DeepL saknar → enda källan; räkneordsgrammatik.' },
  { c: 'tr', n: 'turkiska', note: 'vokalharmoni, İ/ı.' },
  { c: 'et', n: 'estniska', note: 'kasusböjning.' },
  { c: 'lv', n: 'lettiska', note: 'makron ā/ē/ī/ū.' },
  { c: 'lt', n: 'litauiska', note: 'kasusböjning.' },
];

const ROOT = '/Users/kristoffernordgren/Developer/dronekoll';

function prompt(lang) {
  return `Du är ${lang.n.toUpperCase()}-översättaren (${lang.c}) för dronekoll.com:s språkmatris (YMYL: drönarregler — ändra aldrig fakta/siffror/enheter).

FÖRST — RESUMBAR: ta reda på vilka länder som SAKNAR översättning (tidigare körning
kan ha hunnit en del). Kör Bash:
  python3 -c "import json,os; t=json.load(open('${ROOT}/data/_matrix_todo/${lang.c}.json')); miss=[i for i in t if not os.path.exists('${ROOT}/src/content/${lang.c}/'+i+'.json')]; print('MISSING',len(miss),' '.join(miss)) if miss else print('DONE')"
Om utskriften är "DONE": returnera "redan klar" och gör INGET mer.
Annars: översätt ENDAST de listade saknade ISO-koderna (inte de som redan finns).

1. Läs ${ROOT}/data/_matrix_todo/_INSTRUCTIONS.md
2. Läs ${ROOT}/data/_matrix_todo/${lang.c}.json (källinnehåll per land)
3. För VARJE saknad ISO: översätt \`fields\` engelska→${lang.n}, skriv
   ${ROOT}/src/content/${lang.c}/{ISO}.json enligt instruktionens exakta form
   (meta: sourceHash kopierad, engine "opus-4-8", translatedAt "2026-07-10", sourceLang "en"; fields översatta, struktur identisk).
${lang.note ? '   Särskilt: ' + lang.note : ''}
   Bevara EASA/NOTAM/VLOS + siffror/enheter; myndighetsnamn igenkännbara.

⚠️ KRITISKT: Översätt allt SJÄLV, direkt med Read/Write/Bash. Spawna ABSOLUT INGA
underagenter (använd INTE Agent-verktyget) — det orsakar server-rate-limiting som
fäller hela körningen. Var token-effektiv: läs todo EN gång, skriv direkt, dumpa
inte innehåll i svaret. Returnera KORT: "${lang.c}: N nya filer" + 2 mikro-stickprov.`;
}

phase('Översätt');
const results = [];
for (let i = 0; i < LANGS.length; i += 3) {
  const chunk = LANGS.slice(i, i + 3);
  const r = await parallel(
    chunk.map((lang) => () =>
      agent(prompt(lang), { label: `xl8:${lang.c}`, phase: 'Översätt', agentType: 'general-purpose' }),
    ),
  );
  results.push(...chunk.map((l, j) => ({ lang: l.c, ok: r[j] != null })));
  log(`Klar med chunk ${i / 3 + 1}/${Math.ceil(LANGS.length / 3)}: ${chunk.map((l) => l.c).join(' ')}`);
}
return results;
