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
