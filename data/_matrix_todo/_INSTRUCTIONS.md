# Matris-översättning — delad instruktion för språk-agenterna

Du översätter drönarregler-innehåll för dronekoll.com från ENGELSKA till ditt
tilldelade målspråk. Innehållet är en kunskapsbank (INTE reklam) — sakligt,
korrekt, pilot-till-pilot. **YMYL: säkerhets-/juridikinnehåll — ändra ALDRIG
fakta, siffror, vikter (250 g), höjder (120 m), avstånd, åldersgränser eller
myndighetsnamn. Översätt troget.**

## In/ut
- **Läs:** `data/_matrix_todo/{LANG}.json` — objekt `{ "ISO": { "sourceHash": "...",
  "fields": {...engelska fält...} }, ... }`.
- **Skriv:** för VARJE ISO en fil `src/content/{LANG}/{ISO}.json` (skapa mappen)
  med EXAKT denna form:
  ```json
  {
    "meta": { "sourceHash": "<kopiera ISO:s sourceHash oförändrad>",
              "engine": "opus-4-8", "translatedAt": "2026-07-10", "sourceLang": "en" },
    "fields": { ...översatta fält, IDENTISK struktur... }
  }
  ```

## Fältregler (structure-preserving)
- `keyRules`, `importantNotes`: arrayer av strängar — översätt varje, BEHÅLL antal + ordning.
- `primaryLinks`, `secondaryLinks`: arrayer av `{title, description}` — översätt bägge,
  behåll antal + ordning. (Inga URL:er finns här — rör inget annat.)
- `disclaimerText`, `sectionLabelRules`, `sectionLabelPrimary`, `sectionLabelSecondary`,
  `linksSheetTitle`, `dronePilotCredentialName`: strängar — översätt.
- Om ett fält saknas i källan: utelämna det (kopiera inte in tomt).
- `sectionLabel*` är RUBRIKER (t.ex. "OFFICIAL SOURCES") — versal-stil om källan har det.

## Översätt ALDRIG (behåll ordagrant)
EASA, FAA, UK CAA, NOTAM, VLOS, BVLOS, MTOM, PDF, GPS, App Store, Google Play,
Part 107, A1/A3, A2, STS-01/02, kategori-koder. Egennamn på myndigheter/organ
och orter behålls igenkännbara (t.ex. "Transportstyrelsen", "LFV", "CASA",
"Bundesnetzagentur", "Amsterdam") — översätt beskrivande ord runt dem, inte namnet.
Valuta/enheter oförändrade (250 g, 120 m, €25, 5,4 km).

## Ton
Naturligt, ledigt och korrekt på målspråket — som en kunnig lokal drönarpilot
förklarar för en annan. Sentence case. Inga anglicismer utöver etablerade
tekniklån. Rätt böjning/genus. Inga maskinöversatta stelheter.

## Kvalitet
När alla filer är skrivna: kör `python3 -c "import json,glob; n=[json.load(open(f)) for f in glob.glob('src/content/{LANG}/*.json')]; print(len(n),'filer OK')"` (byt {LANG}).
Returnera KORT: antal filer skrivna + 2 exempel (en keyRule + ett dronePilotCredentialName)
så kvaliteten kan stickprovas. Skriv INTE ut allt innehåll.
