/**
 * Feed-status-tillägg (≤2KB) — körs bara på sidor med [data-freshness].
 * Hämtar pappilappi status.json (CORS ok) och visar luftrumsFEEDENS status
 * som en SEPARAT, tydligt märkt notering.
 *
 * Sedan 2026-09-24 bär badgen ingen egen text — datumstämpeln "Regler
 * kontrollerade {datum}" är borttagen (se FreshnessBadge.astro). Badgen är
 * dold (`hidden`) och visas BARA med feed-noteringen när en feed är
 * degraderad. REPO-P0-03 gäller fortfarande: feed-status är teknisk status
 * och får aldrig läsas som att reglerna är kontrollerade — frisk feed ⇒
 * ingen badge alls (tystnad = normalläge). Fetch-fel → badgen förblir dold.
 * Ingen relativtid (den beskrev feedens ålder, inte reglernas).
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
      note.textContent = badge.dataset.msgWarn || '';
      badge.querySelector('.freshness__text')?.appendChild(note);
      badge.hidden = false; // badgen finns bara för att bära just den här noteringen
    })
    .catch(() => {
      /* Inget tillägg — badgen förblir dold. */
    });
}

export {};
