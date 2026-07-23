# Säkerhet — dronekoll.com

## Byggkedja & CI-härdning (v8-revision, REPO-BUILD)

- **GitHub Actions är SHA-pinnade** (deploy.yml, refresh-snapshots.yml, legal
  hör hemma i app-repot) med versionskommentar — skyddar mot tag-mutation/
  supply-chain. Bumpa: hämta ny SHA (`gh api repos/OWNER/REPO/commits/TAG --jq .sha`).
- **Snapshot-boten validerar data före commit** (`scripts/validate-snapshot.mjs`,
  fail-closed) — en trasig/tom fetch kan inte längre committas som "färsk" fallback
  (REPO-BUILD-02).
- **Intern länkkontroll i bygget** (`scripts/check-links.mjs`, fail-closed) —
  brutna interna länkar/ankare fäller CI.

## npm audit-status (--omit=dev)

Senast granskad: 2026-07-23. Åtgärdat: **svgo** (removeScripts) via icke-brytande
`npm audit fix`.

Kvarvarande 3 (kräver brytande major-uppgradering — hanteras separat, EJ `--force` blint):

| Paket | Allvar | Icke-tillämplighetsanalys | Åtgärd |
|---|---|---|---|
| **esbuild** (GHSA-g7r4-m6w7-qqqr) | låg | Gäller ENBART `astro dev`-servern på **Windows**. Produktionen kör `astro build` (ingen dev-server) på Linux-runner → **ej i produktionsvägen**. | Löses av astro@7 (major). Ingen prod-exponering tills dess. |
| **sharp / libvips** (GHSA-f88m-g3jw-g9cj, 4 CVE:er) | hög | sharp används vid **byggtid** för OG-bildsgenerering, av **egen kontrollerad** SVG/bild-input (ej användaruppladdningar). CVE:erna är minnesfel på **manipulerade** bilder → mycket låg reell exponering. | sharp@0.35 (brytande) eller astro@7. Kör OG-bildsregression vid uppgradering. |

**Tidssättning:** vid nästa Astro-major-uppgradering (astro@7) — då försvinner både
esbuild- och sharp-fynden. Uppgraderingen kräver full bygg-/sid-/OG-regression och
görs som eget arbetspaket (rapportens instruktion: använd inte `--force` blint).

## Kvarstår (Fas 6, ej gjort denna omgång)

- **Integritetspolicy:** faktabaserat utkast finns i `docs/privacy-v8-draft.md`
  (webb komplett; app = skelett). Kräver Kristoffers/jurists slutkontroll +
  implementation som Astro-sidor `/privacy/web/` + `/privacy/app/` (SV+EN) innan
  `public/privacy.html` ersätts (REPO-P0-07).
- **Fuller testsvit** (lint/Playwright/axe/e2e enligt DoD): eget infra-arbetspaket
  (devDependencies + config). check/check:links/validate-snapshot finns nu.
- **Historisk secret scan** i säker CI-miljö (utöver arbetskopie-scannen).
