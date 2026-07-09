/**
 * Freshness-uppgradering (≤2KB) — körs bara på sidor med [data-freshness].
 * Hämtar pappilappi status.json (CORS ok), hittar landets status och byter
 * badgens text till relativtid på SIDANS språk via Intl.RelativeTimeFormat.
 * Svenska "detail"-strängar ur status.json används ALDRIG. Fetch-fel →
 * SSR-fallbacken står orörd kvar. Fasta badge-mått → CLS 0.
 */
const badge = document.querySelector<HTMLElement>('[data-freshness]');

if (badge) {
  const iso = badge.dataset.freshness!;
  const lang = badge.dataset.lang || 'en';

  interface Check {
    status: string;
    last_modified: string | null;
  }
  interface CountryStatus {
    iso: string;
    status: string;
    checks: Check[];
  }

  fetch('https://pappilappi.com/status/status.json', {
    signal: AbortSignal.timeout(3000),
  })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((data: { countries?: CountryStatus[] }) => {
      const country = data.countries?.find((c) => c.iso === iso);
      if (!country) return;

      // Färskaste feed-checkens last_modified → relativtid på sidans språk.
      let newest = 0;
      for (const check of country.checks ?? []) {
        if (check.last_modified) {
          const ts = Date.parse(check.last_modified);
          if (ts > newest) newest = ts;
        }
      }

      const textEl = badge.querySelector<HTMLElement>('.freshness__text');
      if (!textEl) return;

      const parts: string[] = [];
      if (newest > 0) {
        const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto', style: 'short' });
        const diffMin = Math.round((newest - Date.now()) / 60_000);
        const rel =
          Math.abs(diffMin) < 60
            ? rtf.format(diffMin, 'minute')
            : Math.abs(diffMin) < 60 * 48
              ? rtf.format(Math.round(diffMin / 60), 'hour')
              : rtf.format(Math.round(diffMin / (60 * 24)), 'day');
        parts.push(rel);
      }

      if (country.status === 'ok') {
        parts.push(badge.dataset.msgOk || '');
      } else {
        badge.classList.add('is-warn');
        parts.push(badge.dataset.msgWarn || '');
      }

      const line = parts.filter(Boolean).join(' · ');
      if (line) textEl.textContent = line;
    })
    .catch(() => {
      /* SSR-fallbacken står kvar — inget att göra */
    });
}

export {};
