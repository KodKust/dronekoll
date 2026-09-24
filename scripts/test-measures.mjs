#!/usr/bin/env node
/**
 * Självtest för mätvärdeskontrollen (scripts/lib/measures.mjs): de kända
 * falsklarmen godtas som varning, men ett ändrat eller tappat tal fälls alltid
 * — och en riktig enhet blir aldrig ett "falsklarm".
 *   node scripts/test-measures.mjs
 */
import { compareMeasures } from './lib/measures.mjs';

let fails = 0;
function fall(namn, src, tr, { missing = [], accepted = [] }) {
  const r = compareMeasures(src, tr);
  const got = { missing: r.missing, accepted: r.accepted.map((a) => a.token) };
  const ok = JSON.stringify(got) === JSON.stringify({ missing, accepted });
  if (!ok) fails++;
  console.log(`  ${ok ? '✓' : '✗'} ${namn}${ok ? '' : `  → ${JSON.stringify(got)}`}`);
}

console.log('Grundkontrollen:');
fall('samma mätvärde', 'Max 120 m above ground', 'Maks 120 m over bakken', {});
fall('ändrat tal fälls', 'Max 120 m above ground', 'Maks 150 m over bakken', { missing: ['120m'] });
fall('tusental normaliseras', 'Fine up to 2,500 €', 'Bußgeld bis 2 500 €', {});
fall('riktig enhet: "250 g" → "250 gramos" fälls (ingen ordbörjan)', 'Drones under 250 g', 'Drones de menos de 250 gramos', { missing: ['250g'] });

console.log('Kända falsklarm (godtas som varning):');
fall('tidsenhet översatt', 'Valid for 5 years', 'Valido per 5 anni', { accepted: ['5years'] });
fall('procent före talet (tr)', 'At least 75% battery', 'En az %75 batarya', { accepted: ['75%'] });
fall('mt "għal" är inget gram', 'Multa ta\' 10 għal kull ksur', 'A fine of 10 for each breach', { accepted: ['10g'] });
fall('tr "gün" är inget gram', 'En geç 3 gün önce başvurun', 'Apply at least 3 days before', { accepted: ['3g'] });
fall('pl "r." är ingen rand', 'Od 1 stycznia 2025 r. obowiązuje', 'From 1 January 2025 applies', { accepted: ['2025r'] });

console.log('… men ett ändrat eller tappat tal fälls ändå:');
fall('tidsenhet med ändrat tal', 'Valid for 5 years', 'Valido per 3 anni', { missing: ['5years'] });
fall('procent med ändrat tal', 'At least 75% battery', 'En az %57 batarya', { missing: ['75%'] });
fall('"għal" med tappat tal', 'Multa ta\' 10 għal kull ksur', 'A fine for each breach', { missing: ['10g'] });
fall('talet finns bara INUTI ett annat tal', 'Valid for 5 years', 'Valido per 15 anni', { missing: ['5years'] });

console.log(fails === 0 ? '\nPASS' : `\n${fails} FEL`);
process.exit(fails === 0 ? 0 : 1);
