/**
 * Landsnamnets former (artikel + kasus) och H1-uppdelningen — ETT ställe.
 *
 * REN JS med flit: scripts/og-images.mjs körs med rå node och kan inte importera
 * TS. Låg logiken i seo.ts skulle og-skriptet tvingas bygga en egen kopia av
 * EN_ARTICLE_ISO och fi-fallbacken — och en OG-bild med fel böjning är en JPEG
 * som ingen granskar, så drift där kan ligga ute i månader. model.ts och seo.ts
 * re-exporterar/importerar härifrån, så alla befintliga importvägar är intakta.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** Engelska landsnamn som kräver bestämd artikel "the" i löptext (SEO/GEO). */
export const EN_ARTICLE_ISO = new Set(['US', 'GB', 'NL', 'CZ', 'DO', 'PH', 'AE']);

/** "the " för engelska sidor vars landsnamn tar bestämd artikel, annars "". */
export function enArticle(iso, lang) {
  return lang === 'en' && EN_ARTICLE_ISO.has(iso) ? 'the ' : '';
}

/**
 * Finska landsnamnsformer (data/fi-country-forms.json): "in" = missä-kasus
 * (Suomessa/Kyproksella), "gen" = genitiv (Suomen).
 *
 * Finskan saknar preposition för "i {land}" — namnet böjs. De finska mallarna
 * kringgick det förut med "drone{country}issa" ("droneRanskaissa"), som är
 * grammatiskt trasigt. Tabellen är den enda sanningen, ingen algoritmisk
 * böjning: vokalharmoni, konsonantgradation, ö-namnens ytterlokalkasus och
 * sammansatta namn (Isossa-Britanniassa) går inte att härleda ur nominativen
 * utan att bli fel någonstans. verify-build sektion 7 kräver 55/55.
 *
 * @typedef {{ in: string, gen: string }} FiForms
 * @returns {FiForms | null}
 */
let _fiForms = null;
export function fiCountryForm(iso) {
  if (!_fiForms) {
    const p = join(process.cwd(), 'data/fi-country-forms.json');
    const raw = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
    _fiForms = {};
    for (const [k, v] of Object.entries(raw)) {
      if (!k.startsWith('_')) _fiForms[k.toUpperCase()] = v;
    }
  }
  return _fiForms[iso.toUpperCase()] ?? null;
}

/**
 * Kasusformer till t()-mallarna (titlar, beskrivningar, FAQ). Artikeln är
 * INBAKAD i {country} — de mallarna renderar en enda textnod. Fallback till
 * nominativen så en löptextmall aldrig går sönder av att sakna en form.
 */
export function countryParams(iso, lang, displayName) {
  const country = enArticle(iso, lang) + displayName;
  const fi = lang === 'fi' ? fiCountryForm(iso) : null;
  return { country, countryIn: fi?.in ?? country, countryGen: fi?.gen ?? country };
}

/** Kasusnycklar som över huvud taget finns — bara för felmeddelandet. */
const CASE_KEYS = ['country', 'countryIn', 'countryGen'];

/**
 * H1:ns former: UTAN artikel (den renderas som egen textnod utanför accent-
 * spanen) och — avsiktligt — BARA de nycklar vi kan fylla KORREKT för språket.
 *
 * Saknas en äkta böjd form utelämnas nyckeln, så splitCountryHeading kastar i
 * stället för att tyst falla tillbaka på nominativen. countryParams får
 * fortsätta falla tillbaka (löptext tål "i Suomi" i nödfall) — men H1 är
 * sajtens tyngsta SEO-sträng, och fel form DÄR är precis vad som kostade
 * söktrafiken i juli 2026.
 */
function headingForms(iso, lang, displayName) {
  const inflected = lang === 'fi' ? fiCountryForm(iso) : null;
  return inflected
    ? { country: displayName, countryIn: inflected.in, countryGen: inflected.gen }
    : { country: displayName };
}

const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * Delar en H1-mall vid dess EGEN landsplatshållare, så varje språk äger sin
 * ordföljd och rätt kasusform hamnar i accent-spanen.
 *
 * KASTAR om mallen inte bär exakt en platshållare vi kan fylla. t() (i18n.ts)
 * substituerar bara de params anropet skickar och varnar aldrig — utan det här
 * kastet skulle "{countryIn}" renderas som synlig råtext på sidan och brännas
 * in i OG-bilderna. Sajten har redan haft tre sådana läckage.
 *
 * @returns {{ pre: string, article: string, accent: string, post: string }}
 */
export function splitCountryHeading(tpl, { iso, lang, displayName, key = 'hero.h1.country' }) {
  const forms = headingForms(iso, lang, displayName);
  const found = [...String(tpl).matchAll(PLACEHOLDER)].map((m) => m[1]);
  const name = found[0];

  if (found.length !== 1 || !Object.hasOwn(forms, name)) {
    const avail = Object.keys(forms)
      .map((k) => `{${k}}`)
      .join(' / ');
    const why =
      found.length === 1 && CASE_KEYS.includes(name)
        ? `{${name}} är en böjd form som saknar tabell för "${lang}"/${iso}` +
          ` (bara finskan har data/fi-country-forms.json).`
        : `hittade [${found.map((f) => `{${f}}`).join(', ') || 'ingen platshållare'}].`;
    throw new Error(
      `${key}[${lang}]: H1-mallen måste bära exakt en av ${avail} — ${why}\n` +
        `  mall: "${tpl}"\n` +
        `  En platshållare vi inte kan fylla skulle renderas som RÅTEXT på sidan.`,
    );
  }

  const [pre, post = ''] = tpl.split(`{${name}}`);
  // enArticle ger "the " bara på engelska (Nederländerna/UK/USA m.fl.). Vid
  // meningsstart ska den versaliseras ("The Netherlands — …"); mitt i en fras
  // behålls gemener ("… in the Netherlands?"). pre är tom precis när landet
  // inleder H1:n — trim() så att en mall med inledande blanksteg också räknas.
  const raw = enArticle(iso, lang);
  const article = raw && pre.trim() === '' ? raw.charAt(0).toUpperCase() + raw.slice(1) : raw;

  return { pre, article, accent: forms[name], post };
}
