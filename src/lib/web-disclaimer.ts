/**
 * Landssidans friskrivning på WEBBEN.
 *
 * disclaimerText (countries.json + översättningsoverlays) är skriven för appen:
 * meningen "This app is a tool — not a legal authority." står i ~250 varianter
 * på 27 språk. På en webbsida pekar "den här appen" på något som inte finns på
 * skärmen. Resten av texten är landsspecifik och ofta sakbärande (UAE:s
 * flygstopp, Ukrainas krigslagar, Greklands HCAA-ansökan) och ska stå kvar —
 * därför byts BARA app-meningen mot sajtens egen sources.disclaimer.
 *
 * App-meningen känns igen på appordet i en kort mening (≤ 120 tecken). Mätt
 * 2026-10-15 över alla overlays + källtexter: exakt en träff i varje text.
 * Hittas ingen träff lämnas texten orörd (hellre "appen" än tappad sakinfo).
 * Appens API (/api/cell/) får disclaimerText oförändrad — där är den korrekt.
 */
import { t } from './i18n';

// Mönstren omsluts av Unicode-medvetna ordgränser (JS \b är ASCII-only och
// missar t.ex. "programėlė" och kyrilliska).
const APP_WORD: Record<string, string> = {
  en: 'app', sv: 'app(en)?', no: 'appen', da: 'app(en)?', de: 'App', nl: 'app',
  fr: 'application', es: 'aplicaci[oó]n', it: 'app|applicazione',
  pt: 'aplicativo|aplica[cç][aã]o|app', el: 'εφαρμογή', pl: 'aplikacja', cs: 'aplikace',
  sk: 'aplikácia', hu: 'alkalmazás', ro: 'aplica[țţ]i[ea]', et: 'rakendus', lv: 'lietotne',
  lt: 'programėlė', sl: 'aplikacija', hr: 'aplikacija', mt: 'applikazzjoni', tr: 'uygulama',
  uk: 'додаток|застосунок', bg: 'приложение', is: 'forrit\\p{L}*', fi: 'sovellus',
};

const SENTENCE_SPLIT = /(?<=[.!?])\s+/;

export function webDisclaimer(text: string, lang: string): string {
  const word = APP_WORD[lang];
  if (!word) return text;
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${word}|app(?:en|ið|in|i|a|s)?)(?![\\p{L}\\p{N}])`, 'iu');
  const hit = text.split(SENTENCE_SPLIT).find((s) => s.length <= 120 && re.test(s));
  return hit ? text.replace(hit, t('sources.disclaimer', lang)) : text;
}
