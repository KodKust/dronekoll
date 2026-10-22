# Översättningsflöde — matriscellerna

De landsspecifika regeltexterna (`src/content/{lang}/{ISO}.json`) är översättningar
av en engelsk källa. Sajten renderar dem, och **appen läser samma filer live** via
`/api/cell/{lang}/{ISO}.json` (cache 6 h) — ingen app-release behövs när de ändras.

## Varför de blir inaktuella

Varje cell bär `meta.sourceHash` = ett kvitto på exakt vilken engelsk text den
översattes ur. Rättas den engelska källan (countries.json eller EN-overlayn)
stämmer inte kvittot längre, och cellen är **stale**.

Stale är inte en bugg. Appen och sajten känner igen det och visar den engelska
originaltexten i stället — hellre rätt innehåll på fel språk än fel innehåll på
rätt språk. `node scripts/check-matrix-staleness.mjs` visar läget.

Typisk orsak: en regelrättning i dronarkartan (t.ex. v8-svansen `7b0456c`,
2026-07-24, som rättade 278 påståenden och gjorde 313 celler stale på en gång).

## Översätt här (för enstaka celler)

Kör `node scripts/build-matrix-source.mjs && node scripts/build-matrix-todo.mjs`,
följ `data/_matrix_todo/_INSTRUCTIONS.md`, skriv cellerna, sätt
`meta.engine` + `meta.translatedAt` + `meta.sourceHash`.

## Språkgranskning — ett format för hela sajten

`export-review.mjs` + `import-review.mjs` ersatte det tidigare paret
export/import-language-review (chrome) och export/import-translation-job
(regeltexter). Skillnaden behövdes aldrig: varje post har `en`, `current` och
tomma `fixed`/`why`. Är `current` en daterad översättning av en ändrad engelsk
text skriver granskaren en ny — är den bara språkligt skev rättas språket.
Samma uppgift, samma instruktion, ett filformat.

```bash
node scripts/export-review.mjs --out ~/Desktop/Språkgranskning
# → 26 mappar (en per språk) × ~12 filer: 1-webbtexter, 3-regler-A …
node scripts/import-review.mjs ~/Desktop/Språkgranskning            # torrkör allt
node scripts/import-review.mjs ~/Desktop/Språkgranskning --apply --engine gpt-5
STRICT_EN=1 ASSERT_PAGES=1 STRICT_L10N=1 npx astro build && node scripts/verify-build.mjs
```

Mappordningen följer språk som är modersmål i ett land med **zonkarta** —
huvudmarknaderna först, långsvansen sist. Filerna delas i portioner om ~22 000
tecken så var och en ryms i ett chattsvar.

Importern avvisar per post (resten av filen skrivs ändå): tappad eller tillagd
platshållare, ändrat mätvärde, borttappad skyddad term, radantal som inte matchar
källan. `meta.title`/`meta.desc` exporteras inte alls — SEO väger sökord mot
ordagrannhet och är ett affärsbeslut, inte en språkfråga.

`--engine` hamnar i cellens proveniens och måste finnas i vitlistan i
`src/lib/schema.ts`. Nya motorer läggs till MEDVETET, annars faller bygget.

## Efter import

Push till `main` deployar sajten (minuter). Appen hämtar samma texter inom 6 h.
Ingen App Store-release, ingen Gist-push.

## Resident-celler (CH på franska och italienska, 2026-10-22)

Matriscellen täcker det en **besökare** behöver (keyRules, importantNotes, länktitlar,
friskrivning). En **bofast** med annat UI-språk än landets — ~23 % av Schweiz talar
franska, ~8 % italienska — behöver dessutom checklistan, onboardingen (kort + lång),
zonreglerna ur `airspace_rules.json`, språkade länkadresser (BAZL:s `/fr/`-sidor) och
myndighetskartan i rätt språkversion. Det ligger i en **egen källmapp**:

```
src/content-resident/{lang}/{ISO}.json
```

Skillnader mot matrisen:

- **Översätts ur landets EGET språk** (CH: tyska), inte ur EN-overlayn.
- **Egen färskhetsnyckel.** `meta.sourceHash` = trunkerad sha256 över den kanoniska
  JSON:en av checklist + onboarding + onboardingExtended + landets `ISO:`-regler i
  `airspace_rules.json` + länk-id→URL + airspaceMapUrl. Receptet bor i
  `src/lib/resident.ts` och speglas i `scripts/build-resident-source.mjs`.
- **Stale ⇒ fälten utelämnas** ur `/api/cell/{lang}/{ISO}.json` (appen visar native för
  just de delarna); matriscellen i övrigt påverkas inte. Bygget faller aldrig på det —
  `scripts/check-resident-staleness.mjs` (i `npm run check` och deploy) rapporterar.
- **Appen** (dronarkartan ≥ versionen efter 1.3.8, `CountryService.residentCellIsos`)
  hämtar cellen för hemlandet bara när landet står på vitlistan och hemspråket ≠
  landets. Vakter i appen: per-index-parning vid lika antal, ikoner/färger ur basen,
  språkad URL bara med samma värdnamn, regler bara för zontyper basen redan har.

Arbetsgång för ett nytt (språk, land):

```bash
node scripts/fetch-data.mjs                      # countries.json + airspace_rules.json från Gist
node scripts/build-resident-source.mjs CH        # → data/_resident_todo/CH.json (källa + sourceHash)
# översätt fälten → src/content-resident/fr/CH.json, kopiera sourceHash till meta
node scripts/check-resident-staleness.mjs        # 0 stale, 0 strukturfel
npm run check                                    # bygg + API-kontrakt (resident-fälten typvaktas)
```

Hashen räknas mot det som ligger på Gisten vid bygget. Rättas den tyska källan i
dronarkartan (t.ex. ß → ss) blir cellen stale tills Gisten publicerats — det är avsikten:
hellre tysk onboarding än en fransk som beskriver en gammal tysk.
