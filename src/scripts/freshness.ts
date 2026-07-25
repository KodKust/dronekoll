/**
 * Feed-status-tillägg (≤2KB) — körs bara på sidor med [data-freshness].
 * Hämtar pappilappi status.json (CORS ok) och visar luftrumsFEEDENS status
 * som en SEPARAT, tydligt märkt notering.
 *
 * REPO-P0-03: badgens huvudtext ("Regler kontrollerade {datum}") är ett
 * juridiskt granskningsdatum och får ALDRIG skrivas över av teknisk
 * pipeline-/feed-status — en frisk feed är inte bevis för att reglerna är
 * aktuella. Vid frisk feed visas därför INGET extra (tystnad = normalläge,
 * ingen anledning att trumpeta en teknisk detalj). Vid degraderad feed
 * TILLÄGGS en distinkt notering — ersätter aldrig regel-datumet.
 * Fetch-fel → inget tillägg, SSR-texten står orörd. Ingen relativtid (den
 * beskrev feedens ålder, inte reglernas — konflationsrisk togs bort med den).
 */
const badge = document.querySelector<HTMLElement>('[data-freshness]');

if (badge) {
  const iso = badge.dataset.freshness!;

  interface StatusCheck {
    name: string;
    status: string;
    /** data_health.py: "feed" | "rules" | "link" | "other" (saknas i äldre status.json) */
    kind?: string;
  }
  interface CountryStatus {
    iso: string;
    status: string;
    checks?: StatusCheck[];
  }

  /**
   * Landets AGGREGERADE status duger inte som trigger (2026-07-25): den blir
   * "warn" även av regel-audit-påminnelsen ("regler verifierade 50d sedan —
   * dags för audit") och av döda länkar i källistan. Ingetdera är en
   * degraderad feed, men besökaren fick ändå läsa "Dataflödet försämrat" —
   * FI/FR/NO visade larmet med sprillans färska feeds, och för en besökare
   * som söker just det landets regler läser det som "sajtens data är trasig".
   * Bara FEED-checkar får trigga noteringen. kind sätts av data_health.py;
   * saknas det (äldre status.json) faller vi tillbaka på namnprefixet, och
   * saknas checks helt är vi TYSTA — ett falsklarm på en publik sida är
   * värre än ett uteblivet larm som ändå syns på statussidan.
   */
  const isFeedCheck = (c: StatusCheck) =>
    c.kind ? c.kind === 'feed' : /^(Feed:|Primär)/.test(c.name || '');

  fetch('https://pappilappi.com/status/status.json', {
    signal: AbortSignal.timeout(3000),
  })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((data: { countries?: CountryStatus[] }) => {
      const country = data.countries?.find((c) => c.iso === iso);
      if (!country?.checks?.length) return;
      const degraded = country.checks.some(
        (c) => isFeedCheck(c) && (c.status === 'warn' || c.status === 'fail'),
      );
      if (!degraded) return; // frisk feed: inget att tillägga

      const note = document.createElement('span');
      note.className = 'freshness__feednote';
      note.textContent = ' · ' + (badge.dataset.msgWarn || '');
      badge.querySelector('.freshness__text')?.appendChild(note);
    })
    .catch(() => {
      /* Inget tillägg — SSR-texten (regel-datumet) står orörd. */
    });
}

export {};
