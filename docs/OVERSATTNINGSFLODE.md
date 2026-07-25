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

## Efter import

Push till `main` deployar sajten (minuter). Appen hämtar samma texter inom 6 h.
Ingen App Store-release, ingen Gist-push.
