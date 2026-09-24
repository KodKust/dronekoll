/**
 * Mätvärdeskontrollen för översättningsimport — delad mellan
 * import-translation-job.mjs och självtestet scripts/test-measures.mjs.
 *
 * Varje mätvärde (tal + enhet) i källan ska finnas i översättningen.
 * Tusentalsavgränsare och decimaltecken normaliseras (2,500 = 2 500), men
 * VÄRDET måste stämma.
 *
 * Kända falsklarm (källförvaltningen 2026-09-23/24: 26 EN-overlays + 910
 * matrisceller, varje mönster bekräftat för hand): regexen ser en ENHET där
 * översättningen legitimt skriver om den. De godtas som VARNING — aldrig
 * tyst — och BARA om talet står kvar som eget tal i översättningen. Ett
 * tappat eller ändrat tal fälls alltid.
 *   · tidsenheten översatt: "5 years" → "5 anni" / "5 lat" / "5 év"
 *   · procenttecknet före talet: turkiska "%75", "%20'si"
 *   · enhetsbokstaven är början på ett ord i källan: "10 għal" (mt),
 *     "3 gün" (tr), "2025 r." (pl 'rok') — i-flaggan gör g/r/m/j till
 *     enheter, och \b räknar icke-ASCII-bokstäver som ordgräns
 * En riktig enhet ("250 g" följt av mellanslag) räknas aldrig som falsklarm.
 */
export const NUM_UNIT = /(\d[\d., \s]*)\s*(kg|g\b|km|m\b|ft|NM|J\b|%|SGD|HK\$|€|£|\$|R\b|år|years?|months?|min)/gi;
export const norm = (s) => String(s).replace(/[\s .,'’]/g, '');

export function measures(text) {
  const out = new Set();
  for (const m of String(text).matchAll(NUM_UNIT)) out.add(`${norm(m[1])}${m[2].toLowerCase()}`);
  return out;
}

/** Talen i en text som egna tal (normaliserade som i measures). */
function numbersIn(text) {
  return new Set([...String(text).matchAll(/\d[\d., \s'’]*/g)].map((m) => norm(m[0])));
}

const TIME_UNITS = new Set(['years', 'year', 'months', 'month', 'min', 'år']);
const WORD_START_UNITS = new Set(['g', 'r', 'm', 'j']);

/** Skäl (sträng) om token är ett känt falsklarm, annars null. */
export function knownFalseAlarm(token, src, tr) {
  const m = /^(\d+)(.*)$/.exec(token);
  if (!m) return null;
  const [, num, unit] = m;
  if (!numbersIn(tr).has(num)) return null; // talet borta/ändrat → alltid fel
  if (TIME_UNITS.has(unit)) return 'tidsenheten översatt';
  if (unit === '%' && new RegExp(`%\\s?${num}(?!\\d)`).test(String(tr))) {
    return 'procenttecknet före talet (turkisk ortografi)';
  }
  if (WORD_START_UNITS.has(unit)) {
    for (const mm of String(src).matchAll(/(\d[\d., ]*)\s*([gGrRmMjJ])/dg)) {
      if (norm(mm[1]) !== num || mm[2].toLowerCase() !== unit) continue;
      const nxt = String(src).charAt(mm.indices[2][1]);
      if (nxt === '.' || (/[^\x00-\x7F]/.test(nxt) && /\p{L}/u.test(nxt))) {
        return `bokstaven "${mm[2]}${nxt}" är början på ett ord, inte en enhet`;
      }
    }
  }
  return null;
}

/** Jämför källa och översättning: { missing: [token], accepted: [{token, why}] }. */
export function compareMeasures(src, tr) {
  const have = measures(tr);
  const missing = [];
  const accepted = [];
  for (const t of measures(src)) {
    if (have.has(t)) continue;
    const why = knownFalseAlarm(t, src, tr);
    if (why) accepted.push({ token: t, why });
    else missing.push(t);
  }
  return { missing, accepted };
}
