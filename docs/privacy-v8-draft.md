# Integritetspolicy — UTKAST v8 (kräver Kristoffers/jurists slutkontroll före publicering)

Faktabaserad, byggd på den verkliga behandlingsinventeringen 2026-07-23. Ersätter
`public/privacy.html` (ogiltig "fortsatt användning = samtycke" + spekulativ AdSense).
När texten godkänns: implementeras som Astro-sidor `/privacy/web/` + `/privacy/app/`
i sajtens design, SV + EN. App-policyn nedan är ett SKELETT — appens exakta behandling
måste verifieras mot appen + App Store-deklarationerna (utanför sajt-repot).

---

## /privacy/web/ — webbplatsen (dronekoll.com)

### EN

**Privacy policy — DroneKoll website (dronekoll.com)**

This policy explains what personal data is processed when you visit **dronekoll.com**,
why, on what legal basis, how long it is kept, who receives it and your rights. It
covers the **website only**. The DroneKoll mobile app is covered by a separate policy.

**Controller:** DroneKoll (Kristoffer Nordgren), Västerås, Sweden. Contact:
kristoffer.nordgren@gmail.com.

**What is processed, and why**

1. **Hosting and server logs.** The site is hosted on GitHub Pages (GitHub, Inc., USA).
   To deliver a page and to keep the service secure, GitHub's servers automatically
   process your IP address, browser type and request time. *Legal basis:* legitimate
   interest (operating and securing the site). *Retention:* per GitHub's logging.

2. **Cookieless analytics (GoatCounter).** We use GoatCounter to count page views and
   app-store link clicks in aggregate. GoatCounter is a privacy-focused analytics
   service that sets **no cookies** and builds **no** cross-site advertising profile.
   *Legal basis:* legitimate interest (understanding aggregate usage). Because nothing
   is stored on or read from your device for this, no consent banner is required.

3. **Local storage — language preference.** If you dismiss the "read this page in your
   language" suggestion, a single value (`langSuggest`) is stored in your browser's
   local storage so the suggestion is not shown again. It stays on your device and is
   **never sent to us**. It is strictly functional.

4. **Map tiles and airspace data — only if you open an interactive map.** When you open
   a country's zone map, your browser requests map tiles from **CARTO** and
   **OpenStreetMap**, and airspace/zone data from **pappilappi.com** (our own
   infrastructure). To deliver these, those servers necessarily receive your IP address
   and the tiles/data requested. *Legal basis:* legitimate interest (showing the map you
   asked for). CARTO and OpenStreetMap process this under their own privacy policies.

**No cookies. No advertising. No account or contact form** — the site does not
knowingly collect data that you actively submit.

**Recipients / international transfers.** Hosting: GitHub (USA). Analytics: GoatCounter.
Map/airspace: CARTO, OpenStreetMap, pappilappi.com (our own). Transfers outside the
EU/EEA (e.g. GitHub in the USA) rely on the providers' own safeguards, such as standard
contractual clauses.

**No automated decision-making or profiling** takes place.

**Your rights (GDPR).** You have the right to access, rectification, erasure,
restriction, objection and data portability where applicable, and to lodge a complaint
with the Swedish Authority for Privacy Protection (**IMY**). Contact us at the email
above to exercise your rights.

**Changes.** We may update this policy; the "last updated" date reflects the current
version. *Last updated: [DATUM].*

### SV

**Integritetspolicy — webbplatsen DroneKoll (dronekoll.com)**

Denna policy beskriver vilka personuppgifter som behandlas när du besöker
**dronekoll.com**, varför, på vilken rättslig grund, hur länge de sparas, vilka
mottagare som finns och vilka rättigheter du har. Den gäller **endast webbplatsen**.
DroneKoll-appen omfattas av en separat policy.

**Personuppgiftsansvarig:** DroneKoll (Kristoffer Nordgren), Västerås, Sverige. Kontakt:
kristoffer.nordgren@gmail.com.

**Vad som behandlas och varför**

1. **Hosting och serverloggar.** Webbplatsen driftas på GitHub Pages (GitHub, Inc.,
   USA). För att leverera en sida och hålla tjänsten säker behandlar GitHubs servrar
   automatiskt din IP-adress, webbläsartyp och tidpunkt för anropet. *Rättslig grund:*
   berättigat intresse (drift och säkerhet). *Lagring:* enligt GitHubs loggning.

2. **Cookiefri statistik (GoatCounter).** Vi använder GoatCounter för att räkna
   sidvisningar och klick på app-butikslänkar på aggregerad nivå. GoatCounter är en
   integritetsvänlig statistiktjänst som **inte** sätter cookies och **inte** bygger
   någon annonsprofil över webbplatser. *Rättslig grund:* berättigat intresse (förstå
   aggregerad användning). Eftersom inget lagras på eller läses från din enhet för detta
   krävs ingen samtyckesruta.

3. **Lokal lagring — språkval.** Om du stänger förslaget "läs den här sidan på ditt
   språk" sparas ett enda värde (`langSuggest`) i din webbläsares lokala lagring så att
   förslaget inte visas igen. Det stannar på din enhet och **skickas aldrig till oss**.
   Det är rent funktionellt.

4. **Karttiles och luftrumsdata — endast om du öppnar en interaktiv karta.** När du
   öppnar ett lands zonkarta hämtar din webbläsare karttiles från **CARTO** och
   **OpenStreetMap** samt luftrums-/zondata från **pappilappi.com** (vår egen
   infrastruktur). För att leverera dessa tar de servrarna nödvändigtvis emot din
   IP-adress och de tiles/data som efterfrågas. *Rättslig grund:* berättigat intresse
   (att visa kartan du bett om). CARTO och OpenStreetMap behandlar detta enligt sina
   egna integritetspolicyer.

**Inga cookies. Inga annonser. Inget konto eller kontaktformulär** — webbplatsen samlar
inte medvetet in uppgifter som du aktivt lämnar.

**Mottagare / överföringar.** Hosting: GitHub (USA). Statistik: GoatCounter.
Karta/luftrum: CARTO, OpenStreetMap, pappilappi.com (vår egen). Överföringar utanför
EU/EES (t.ex. GitHub i USA) vilar på leverantörernas egna skyddsåtgärder, såsom
standardavtalsklausuler.

**Ingen automatiserad beslutsprocess eller profilering** förekommer.

**Dina rättigheter (GDPR).** Du har rätt till tillgång, rättelse, radering,
begränsning, invändning och dataportabilitet när den är tillämplig, samt att klaga hos
Integritetsskyddsmyndigheten (**IMY**). Kontakta oss via e-postadressen ovan.

**Ändringar.** Vi kan uppdatera policyn; datumet "senast uppdaterad" visar aktuell
version. *Senast uppdaterad: [DATUM].*

---

## /privacy/app/ — appen (SKELETT — verifiera mot appen + App Store)

Utkast-punkter att bekräfta mot appens faktiska behandling (INTE skrivet färdigt —
kräver app-repo + ASC-deklaration):

- **Plats:** exakt plats används för luftrums-/zonkontroll och flygvarningar. Sparas den?
  Skickas den någonstans? (App Store-listan uppger "exakt plats + kraschdata utan koppling
  till identitet".)
- **Kraschrapportering:** Firebase Crashlytics? Vilka data, vilken lagring?
- **Flyglogg:** lagras lokalt på enheten (inget konto, inget moln) — bekräfta att inget
  nätverksanrop skickar den.
- **Prenumerationer:** hanteras av App Store/Google Play (kvitton, ej kortdata till oss).
- **ADS-B / flygvarningar:** externa datakällor appen anropar.
- **Rättslig grund, lagring, mottagare, överföring, rättigheter** — samma struktur som webben.
- Länka RÄTT policy från App Store-listan och från appens integritetslänk (idag pekar
  App Store på pappilappi.com — ska peka på /privacy/app/).
