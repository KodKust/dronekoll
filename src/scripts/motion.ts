/**
 * Motion-motorn "Luftrum i rörelse" (~2 kB) — tre jobb:
 *
 * 1. [data-stagger]: när containern blir synlig → .in-view → barnen glider in
 *    förskjutet (delays i CSS via nth-child; döljning gated bakom html.js så
 *    no-JS aldrig får osynligt innehåll).
 * 2. [data-countup]: siffror räknar 0→värde med easeOutCubic + lokaliserad
 *    formatering när de blir synliga. Engångs.
 * 3. Reduced-motion: gör INGENTING (CSS:en visar allt statiskt; räknaren
 *    hoppar direkt till slutvärdet).
 *
 * OBS: html.js sätts av inline-snippet i <head> (Base.astro) FÖRE first paint —
 * annars flashar innehållet dolt→synligt.
 */
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

// ── 1. Stagger-entréer ──────────────────────────────────────────────────────
const staggers = document.querySelectorAll<HTMLElement>('[data-stagger]');
if (staggers.length > 0) {
  if (reduced || !('IntersectionObserver' in window)) {
    staggers.forEach((el) => el.classList.add('in-view'));
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('in-view');
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    );
    staggers.forEach((el) => io.observe(el));
  }
}

// ── 2. Räknande siffror ─────────────────────────────────────────────────────
const counters = document.querySelectorAll<HTMLElement>('[data-countup]');
if (counters.length > 0) {
  const fmt = (el: HTMLElement, v: number) =>
    new Intl.NumberFormat(el.dataset.lang || document.documentElement.lang || 'en').format(
      Math.round(v),
    );
  const run = (el: HTMLElement) => {
    const target = parseFloat(el.dataset.countup || '0');
    if (!isFinite(target) || target <= 0 || reduced) {
      el.textContent = fmt(el, target);
      return;
    }
    const dur = Math.min(1400, 600 + target / 60); // större tal ≈ längre, tak 1,4 s
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      el.textContent = fmt(el, target * easeOutCubic(p));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  if (reduced || !('IntersectionObserver' in window)) {
    counters.forEach(run);
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            io.unobserve(e.target);
            run(e.target as HTMLElement);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    counters.forEach((el) => io.observe(el));
  }
}

export {};
