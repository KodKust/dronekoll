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

## Alternativ 1 — översätt här

Kör `node scripts/build-matrix-source.mjs && node scripts/build-matrix-todo.mjs`,
följ `data/_matrix_todo/_INSTRUCTIONS.md`, skriv cellerna, sätt
`meta.engine` + `meta.translatedAt` + `meta.sourceHash`.

## Alternativ 2 — outsourca (extern modell eller översättare)

Själva översättandet behöver inte göras här. Det som **måste** göras här är
kontrollen av det som kommer tillbaka: innehållet är säkerhets- och
juridikinformation, och en extern översättare kan råka "förbättra" en siffra
eller tappa ett myndighetsnamn.

```bash
node scripts/export-translation-job.mjs --lang fr    # → data/_outsourced/fr.job.json
```

Filen innehåller instruktionen överst och en post per textrad (`en`, `current`,
tom `tr` att fylla i). Skicka den som den är — inget mer behöver bifogas.

```bash
node scripts/import-translation-job.mjs fr.ifylld.json --engine gpt-5           # torrkörning
node scripts/import-translation-job.mjs fr.ifylld.json --engine gpt-5 --apply   # skriver
npx astro build && node scripts/verify-build.mjs                                # ALLTID efter
```

Importern skriver **ingenting** om något av detta inte stämmer:

- okänt id, tom rad, fel språk
- ändrat eller borttappat mätvärde (2 500 ft, 250 g, 50 000 SGD, HK$15M)
- borttappad skyddad term (EASA, VLOS, Part 107, SANParks, DigitalSky …)
- radantal som inte matchar källan

Varningar (texten identisk med engelskan, ovanligt lång) skrivs men listas, så
de går att stickprova.

`--engine` hamnar i cellens proveniens och måste finnas i vitlistan i
`src/lib/schema.ts`. Lägg till nya motorer där **medvetet** — annars faller
bygget, vilket är meningen: proveniensen ska aldrig bli en gissning i efterhand.

## Språkgranskning av chrome-strängarna (annat jobb, annan risk)

Matrisjobbet ovan skapar NY text ur engelska. Det här granskar BEFINTLIG text i
`web_strings.json` + `feature-strings.json` — 169 strängar per språk, ~13 500
tecken. Det är knappar, rubriker och FAQ-mallar, alltså rent språk utan
sakuppgifter, och därmed det lager som lämpar sig bäst att lägga ut.

```bash
node scripts/export-language-review.mjs --lang fi,et,lv,lt,pl,hu
# → data/_outsourced/{lang}.review.json — instruktionen ligger i filen
node scripts/import-language-review.mjs fi.granskad.json            # torrkörning
node scripts/import-language-review.mjs fi.granskad.json --apply
npx astro build && node scripts/verify-build.mjs
```

Granskaren fyller i `fixed` bara där något är fel och motiverar i `why`. Tomt
fält = texten duger. `why` är inte kosmetik: det skiljer ett verkligt fel
("partitiv krävs efter räkneord") från en stilåsikt ("låter bättre"). Kommer en
fil tillbaka full av det senare behöver promten stramas åt, inte texten ändras.

Importern fäller på **platshållare** — hårt, aldrig som varning. Försvinner
`{country}` ur en FAQ-mall renderas en halv mening på alla 55 landssidor i det
språket samtidigt. `{countryIn}`/`{countryGen}` känns igen som böjda former av
`{country}` (se `data/fi-country-forms.json`).

Kasusspråken (fi, et, lv, lt, pl, hu) är de mest angelägna: finskan visade sig
2026-07-25 ha krycklösningen "maassa {country}" i 11 mallar, alltså trasig
grammatik på 55 sidor, plus partitivfel och en ren felöversättning
("Lastausalueet…" för "Loading zones…"). Samma sorts fel sitter sannolikt kvar i
de andra fem.

## Efter import

Push till `main` deployar sajten (minuter). Appen hämtar samma texter inom 6 h.
Ingen App Store-release, ingen Gist-push.
