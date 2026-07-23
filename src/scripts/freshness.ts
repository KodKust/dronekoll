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

  interface CountryStatus {
    iso: string;
    status: string;
  }

  fetch('https://pappilappi.com/status/status.json', {
    signal: AbortSignal.timeout(3000),
  })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((data: { countries?: CountryStatus[] }) => {
      const country = data.countries?.find((c) => c.iso === iso);
      if (!country || country.status === 'ok') return; // frisk feed: inget att tillägga

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
