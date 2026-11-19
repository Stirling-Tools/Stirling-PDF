/**
 * Picks the language read-aloud should speak a PDF in. The document's text is
 * the evidence: its script and function words identify one language or none.
 * Short samples, names, numbers and mixed-language pages are not conclusive,
 * and the caller falls back to English.
 *
 * `detectReadAloudLanguageForFile` reads at most a handful of pages with
 * PDF.js; the returned tag is always one the read-aloud selector can show.
 */
import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";
import { supportedLanguages } from "@editor/i18n";
import { pdfWorkerManager } from "@editor/services/pdfWorkerManager";

export const READ_ALOUD_FALLBACK_LANGUAGE = "en-US";

const SAMPLE_PAGE_LIMIT = 5;
const SAMPLE_LETTER_LIMIT = 20_000;
const MIN_LETTERS = 24;
const MIN_SCRIPT_SHARE = 0.25;
const MIN_FOREIGN_DISTINCT_WORDS = 3;

const LETTER = /\p{L}/gu;
const WORD = /[\p{L}]+/gu;

const HAN = /\p{Script=Han}/gu;
const HIRAGANA = /\p{Script=Hiragana}/gu;
const KATAKANA = /\p{Script=Katakana}/gu;
const HANGUL = /\p{Script=Hangul}/gu;
const CYRILLIC = /\p{Script=Cyrillic}/gu;
const ARABIC = /\p{Script=Arabic}/gu;
const GREEK = /\p{Script=Greek}/gu;
const HEBREW = /\p{Script=Hebrew}/gu;
const DEVANAGARI = /\p{Script=Devanagari}/gu;
const THAI = /\p{Script=Thai}/gu;
const MALAYALAM = /\p{Script=Malayalam}/gu;
const TIBETAN = /\p{Script=Tibetan}/gu;
const LATIN = /\p{Script=Latin}/gu;

const TRADITIONAL_HAN = /[這這個們為說時會來對開國學體發裡麼]/g;
const SIMPLIFIED_HAN = /[这个们为说时会来对开国学体发里么]/g;

const PERSIAN_CHARS = /[پچژگ]/g;
const UKRAINIAN_CHARS = /[іїєґ]/gi;
const SERBIAN_CYRILLIC_CHARS = /[ђјљњћџ]/gi;
const RUSSIAN_CHARS = /[ыэё]/gi;
const BULGARIAN_CHARS = /[ъ]/gi;

interface WordProfile {
  language: string;
  words: ReadonlySet<string>;
  distinctiveChars?: RegExp;
}

function words(...entries: string[]): ReadonlySet<string> {
  return new Set(entries);
}

const LATIN_PROFILES: readonly WordProfile[] = [
  {
    language: "en-US",
    words: words(
      "the",
      "and",
      "of",
      "to",
      "in",
      "is",
      "that",
      "for",
      "it",
      "with",
      "as",
      "was",
      "on",
      "be",
      "at",
      "by",
      "this",
      "have",
      "from",
      "or",
      "not",
      "but",
      "what",
      "all",
      "were",
      "when",
      "we",
      "there",
      "can",
      "your",
      "which",
      "their",
      "will",
      "about",
      "how",
      "they",
      "would",
      "other",
      "has",
      "more",
      "been",
      "its",
      "who",
      "now",
      "people",
      "over",
      "only",
      "may",
      "just",
      "where",
      "know",
      "through",
      "much",
      "before",
      "good",
      "new",
      "also",
      "because",
      "does",
    ),
  },
  {
    language: "fr-FR",
    words: words(
      "le",
      "la",
      "les",
      "de",
      "des",
      "du",
      "et",
      "à",
      "un",
      "une",
      "en",
      "est",
      "que",
      "qui",
      "dans",
      "pour",
      "pas",
      "au",
      "sur",
      "se",
      "il",
      "elle",
      "avec",
      "ne",
      "plus",
      "par",
      "ce",
      "son",
      "sa",
      "ses",
      "mais",
      "ou",
      "comme",
      "nous",
      "vous",
      "ils",
      "elles",
      "être",
      "avoir",
      "fait",
      "cette",
      "aux",
      "leur",
      "dont",
      "où",
      "tout",
      "sans",
      "peut",
      "entre",
      "aussi",
    ),
  },
  {
    language: "de-DE",
    words: words(
      "der",
      "die",
      "das",
      "und",
      "in",
      "den",
      "von",
      "zu",
      "mit",
      "sich",
      "des",
      "auf",
      "für",
      "ist",
      "im",
      "dem",
      "nicht",
      "ein",
      "eine",
      "als",
      "auch",
      "es",
      "an",
      "werden",
      "aus",
      "er",
      "hat",
      "dass",
      "sie",
      "nach",
      "wird",
      "bei",
      "einer",
      "um",
      "am",
      "sind",
      "noch",
      "wie",
      "einem",
      "über",
      "einen",
      "so",
      "zum",
      "war",
      "haben",
      "nur",
      "oder",
      "aber",
      "vor",
      "zur",
      "bis",
      "mehr",
      "durch",
      "man",
      "sein",
      "wurde",
      "sei",
      "welche",
    ),
    distinctiveChars: /[ß]/g,
  },
  {
    language: "es-ES",
    words: words(
      "el",
      "la",
      "de",
      "que",
      "y",
      "en",
      "los",
      "del",
      "se",
      "las",
      "por",
      "un",
      "para",
      "con",
      "no",
      "una",
      "su",
      "al",
      "lo",
      "como",
      "más",
      "pero",
      "sus",
      "le",
      "ya",
      "o",
      "este",
      "sí",
      "porque",
      "esta",
      "entre",
      "cuando",
      "muy",
      "sin",
      "sobre",
      "también",
      "me",
      "hasta",
      "hay",
      "donde",
      "quien",
      "desde",
      "todo",
      "nos",
      "durante",
      "todos",
      "uno",
      "les",
      "ni",
      "contra",
      "otros",
      "ese",
      "eso",
      "ante",
      "ellos",
      "esto",
      "antes",
      "algunos",
      "qué",
      "unos",
      "yo",
      "otro",
      "él",
      "tanto",
    ),
    distinctiveChars: /[ñ¿¡]/g,
  },
  {
    language: "pt-PT",
    words: words(
      "o",
      "a",
      "os",
      "as",
      "de",
      "que",
      "e",
      "do",
      "da",
      "em",
      "um",
      "para",
      "é",
      "com",
      "não",
      "uma",
      "se",
      "na",
      "por",
      "mais",
      "dos",
      "como",
      "mas",
      "foi",
      "ao",
      "ele",
      "das",
      "tem",
      "à",
      "seu",
      "sua",
      "ou",
      "ser",
      "quando",
      "muito",
      "há",
      "nos",
      "já",
      "está",
      "eu",
      "também",
      "só",
      "pelo",
      "pela",
      "até",
      "isso",
      "ela",
      "entre",
      "era",
      "depois",
      "sem",
      "mesmo",
      "aos",
      "ter",
      "seus",
      "quem",
      "nas",
      "me",
      "esse",
      "eles",
      "estão",
      "você",
      "tinha",
      "foram",
      "essa",
      "num",
      "nem",
      "suas",
      "meu",
      "às",
      "minha",
      "têm",
      "numa",
    ),
    distinctiveChars: /[ãõç]/g,
  },
  {
    language: "it-IT",
    words: words(
      "il",
      "la",
      "di",
      "che",
      "e",
      "un",
      "a",
      "per",
      "in",
      "una",
      "è",
      "non",
      "con",
      "si",
      "da",
      "sono",
      "come",
      "ha",
      "le",
      "più",
      "ma",
      "al",
      "dei",
      "della",
      "anche",
      "sul",
      "nella",
      "lo",
      "se",
      "nel",
      "alla",
      "tra",
      "quando",
      "era",
      "essere",
      "stato",
      "molto",
      "hanno",
      "fatto",
      "dal",
      "così",
      "perché",
      "tutto",
      "ancora",
      "dopo",
      "senza",
      "dove",
      "tutti",
      "può",
      "due",
      "questo",
      "quella",
      "prima",
      "sua",
      "altro",
      "fare",
      "bene",
      "quindi",
    ),
  },
  {
    language: "nl-NL",
    words: words(
      "de",
      "het",
      "een",
      "van",
      "in",
      "en",
      "is",
      "dat",
      "op",
      "te",
      "zijn",
      "voor",
      "met",
      "die",
      "niet",
      "aan",
      "er",
      "om",
      "ook",
      "als",
      "dan",
      "maar",
      "bij",
      "of",
      "uit",
      "nog",
      "worden",
      "door",
      "over",
      "hij",
      "ze",
      "zich",
      "naar",
      "was",
      "wordt",
      "kan",
      "geen",
      "dit",
      "heeft",
      "meer",
      "deze",
      "wat",
      "men",
      "al",
      "wel",
      "haar",
      "zou",
      "zal",
      "wij",
      "je",
      "ik",
      "hem",
    ),
  },
  {
    language: "pl-PL",
    words: words(
      "i",
      "w",
      "nie",
      "na",
      "z",
      "do",
      "to",
      "że",
      "się",
      "jest",
      "o",
      "jak",
      "ale",
      "po",
      "co",
      "tak",
      "za",
      "od",
      "przez",
      "przy",
      "dla",
      "są",
      "jego",
      "jej",
      "ich",
      "czy",
      "tylko",
      "już",
      "jeszcze",
      "może",
      "być",
      "ma",
      "oraz",
      "gdy",
      "gdzie",
      "który",
      "która",
      "które",
    ),
    distinctiveChars: /[łęążśńźć]/g,
  },
  {
    language: "tr-TR",
    words: words(
      "ve",
      "bir",
      "bu",
      "da",
      "de",
      "için",
      "ile",
      "çok",
      "daha",
      "gibi",
      "olarak",
      "ama",
      "her",
      "kadar",
      "sonra",
      "ancak",
      "olan",
      "var",
      "yok",
      "ne",
      "o",
      "şu",
      "ben",
      "sen",
      "biz",
      "siz",
      "onlar",
      "değil",
      "mi",
      "mı",
      "mu",
      "mü",
    ),
    distinctiveChars: /[çğıöşü]/g,
  },
  {
    language: "sv-SE",
    words: words(
      "och",
      "i",
      "att",
      "det",
      "som",
      "en",
      "på",
      "är",
      "av",
      "för",
      "med",
      "till",
      "den",
      "har",
      "de",
      "inte",
      "om",
      "ett",
      "han",
      "men",
      "var",
      "sig",
      "från",
      "vi",
      "så",
      "kan",
      "när",
      "då",
      "eller",
      "alla",
      "andra",
      "över",
      "efter",
      "vid",
      "under",
      "också",
    ),
    distinctiveChars: /[åäö]/g,
  },
  {
    language: "da-DK",
    words: words(
      "og",
      "i",
      "at",
      "det",
      "en",
      "et",
      "den",
      "til",
      "er",
      "som",
      "på",
      "de",
      "med",
      "han",
      "af",
      "for",
      "ikke",
      "der",
      "var",
      "mig",
      "sig",
      "men",
      "har",
      "om",
      "vi",
      "min",
      "havde",
      "ham",
      "hun",
      "nu",
      "over",
      "da",
      "fra",
      "du",
      "ud",
      "sin",
      "dem",
      "os",
      "op",
      "man",
      "hans",
      "hvor",
      "eller",
      "hvad",
      "skal",
      "selv",
      "her",
      "alle",
      "vil",
      "blev",
      "kunne",
      "ind",
      "når",
      "være",
      "no",
      "noget",
      "ville",
      "jo",
      "deres",
      "efter",
      "ned",
      "skulle",
      "denne",
      "end",
      "dette",
      "også",
      "under",
      "have",
      "dig",
    ),
    distinctiveChars: /[æøå]/g,
  },
  {
    language: "no-NB",
    words: words(
      "og",
      "i",
      "jeg",
      "det",
      "at",
      "en",
      "et",
      "den",
      "til",
      "er",
      "som",
      "på",
      "de",
      "med",
      "han",
      "av",
      "ikke",
      "ikkje",
      "der",
      "så",
      "var",
      "meg",
      "seg",
      "men",
      "har",
      "om",
      "vi",
      "min",
      "mitt",
      "ha",
      "hadde",
      "hun",
      "nå",
      "over",
      "da",
      "ved",
      "fra",
      "du",
      "ut",
      "sin",
      "dem",
      "oss",
      "opp",
      "man",
      "kan",
      "hans",
      "hvor",
      "eller",
      "hva",
      "skal",
      "selv",
      "sjøl",
      "her",
      "alle",
      "vil",
      "bli",
      "ble",
      "blei",
      "blitt",
      "kunne",
      "inn",
      "når",
      "være",
      "kom",
      "noen",
      "noe",
      "ville",
      "dere",
      "deres",
      "kun",
      "ja",
      "etter",
      "ned",
      "skulle",
      "denne",
      "for",
      "deg",
      "si",
      "sine",
      "sitt",
      "mot",
      "å",
      "meget",
      "dette",
    ),
    distinctiveChars: /[æøå]/g,
  },
  {
    language: "cs-CZ",
    words: words(
      "a",
      "v",
      "se",
      "na",
      "je",
      "že",
      "o",
      "s",
      "z",
      "do",
      "to",
      "jako",
      "ale",
      "pro",
      "za",
      "by",
      "po",
      "od",
      "nebo",
      "který",
      "která",
      "které",
      "jsou",
      "byl",
      "byla",
      "bylo",
      "jeho",
      "její",
      "jejich",
      "také",
      "už",
      "jen",
      "ještě",
      "může",
      "být",
      "má",
      "při",
      "když",
      "kde",
      "aby",
    ),
    distinctiveChars: /[ěřů]/g,
  },
  {
    language: "sk-SK",
    words: words(
      "a",
      "v",
      "sa",
      "na",
      "je",
      "že",
      "o",
      "s",
      "z",
      "do",
      "to",
      "ako",
      "ale",
      "pre",
      "za",
      "by",
      "po",
      "od",
      "alebo",
      "ktorý",
      "ktorá",
      "ktoré",
      "sú",
      "bol",
      "bola",
      "bolo",
      "jeho",
      "jej",
      "ich",
      "tiež",
      "už",
      "len",
      "ešte",
      "môže",
      "byť",
      "má",
      "pri",
      "keď",
      "kde",
      "aby",
    ),
    distinctiveChars: /[ťľ]/g,
  },
  {
    language: "ro-RO",
    words: words(
      "și",
      "în",
      "de",
      "la",
      "a",
      "cu",
      "pe",
      "din",
      "un",
      "o",
      "pentru",
      "este",
      "care",
      "nu",
      "se",
      "mai",
      "ca",
      "să",
      "că",
      "dar",
      "sau",
      "fost",
      "lui",
      "ei",
      "ele",
      "sunt",
      "au",
      "fi",
      "prin",
      "le",
      "al",
      "ale",
      "după",
      "când",
      "unde",
      "poate",
    ),
    distinctiveChars: /[ăîșțţ]/g,
  },
  {
    language: "hu-HU",
    words: words(
      "a",
      "az",
      "és",
      "hogy",
      "nem",
      "is",
      "egy",
      "van",
      "de",
      "meg",
      "ez",
      "csak",
      "már",
      "mint",
      "még",
      "el",
      "ki",
      "be",
      "fel",
      "le",
      "át",
      "vagy",
      "ha",
      "akkor",
      "amikor",
      "ahol",
      "mert",
      "azt",
      "ezt",
      "volt",
      "lesz",
      "lehet",
      "kell",
    ),
    distinctiveChars: /[őű]/g,
  },
  {
    language: "hr-HR",
    words: words(
      "i",
      "u",
      "na",
      "je",
      "da",
      "se",
      "za",
      "od",
      "su",
      "s",
      "kao",
      "ali",
      "ili",
      "koji",
      "koja",
      "koje",
      "bio",
      "bila",
      "bilo",
      "njegov",
      "njezin",
      "njihov",
      "također",
      "već",
      "samo",
      "još",
      "može",
      "biti",
      "ima",
      "pri",
      "kada",
      "gdje",
      "ako",
    ),
  },
  {
    language: "sl-SI",
    words: words(
      "in",
      "v",
      "na",
      "je",
      "da",
      "se",
      "za",
      "od",
      "so",
      "z",
      "kot",
      "ali",
      "ki",
      "bil",
      "bila",
      "bilo",
      "njegov",
      "njen",
      "njihov",
      "tudi",
      "že",
      "samo",
      "še",
      "lahko",
      "biti",
      "ima",
      "pri",
      "ko",
      "kje",
      "če",
    ),
    distinctiveChars: /[čšž]/g,
  },
  {
    language: "ca-CA",
    words: words(
      "el",
      "la",
      "els",
      "les",
      "de",
      "del",
      "dels",
      "i",
      "a",
      "en",
      "un",
      "una",
      "que",
      "és",
      "per",
      "amb",
      "no",
      "es",
      "al",
      "com",
      "més",
      "però",
      "seus",
      "ja",
      "o",
      "aquest",
      "aquesta",
      "entre",
      "quan",
      "molt",
      "sense",
      "sobre",
      "també",
      "fins",
      "on",
      "qui",
      "des",
      "tot",
      "tots",
      "unes",
      "uns",
      "seu",
      "seva",
    ),
    distinctiveChars: /[·]/g,
  },
  {
    language: "id-ID",
    words: words(
      "dan",
      "yang",
      "di",
      "itu",
      "ini",
      "dengan",
      "untuk",
      "tidak",
      "dari",
      "dalam",
      "akan",
      "pada",
      "juga",
      "saya",
      "kami",
      "kita",
      "mereka",
      "dia",
      "anda",
      "adalah",
      "ada",
      "karena",
      "tetapi",
      "atau",
      "sudah",
      "masih",
      "bisa",
      "harus",
      "sangat",
      "lebih",
      "banyak",
      "sedikit",
      "seperti",
      "setelah",
      "sebelum",
      "ketika",
      "jika",
    ),
  },
  {
    language: "vi-VN",
    words: words(
      "và",
      "của",
      "có",
      "là",
      "không",
      "được",
      "trong",
      "một",
      "những",
      "các",
      "cho",
      "với",
      "này",
      "đó",
      "để",
      "khi",
      "người",
      "từ",
      "đến",
      "về",
      "như",
      "nhưng",
      "cũng",
      "đã",
      "sẽ",
      "đang",
      "phải",
      "nếu",
      "thì",
      "vì",
      "nên",
      "rất",
      "nhiều",
      "ít",
      "hơn",
      "sau",
      "trước",
      "trên",
      "dưới",
      "giữa",
    ),
    distinctiveChars: /[ôđưấếạờốảộìớủềểơịọệậầợởữắừứồẽự]/g,
  },
  {
    language: "az-AZ",
    words: words(
      "və",
      "bir",
      "bu",
      "da",
      "də",
      "üçün",
      "ilə",
      "çox",
      "daha",
      "kimi",
      "olaraq",
      "amma",
      "hər",
      "qədər",
      "sonra",
      "lakin",
      "olan",
      "var",
      "yox",
      "nə",
      "o",
      "şu",
      "mən",
      "sən",
      "biz",
      "siz",
      "onlar",
      "deyil",
    ),
    distinctiveChars: /[ə]/g,
  },
  {
    language: "eu-ES",
    words: words(
      "eta",
      "da",
      "ez",
      "bat",
      "hau",
      "hori",
      "hura",
      "ni",
      "zu",
      "gu",
      "zuek",
      "haiek",
      "nire",
      "zure",
      "bere",
      "gure",
      "zuen",
      "haien",
      "edo",
      "baina",
      "zer",
      "nor",
      "non",
      "noiz",
      "nola",
      "oso",
      "asko",
      "gutxi",
      "gaur",
      "atzo",
      "bihar",
    ),
  },
  {
    language: "ga-IE",
    words: words(
      "an",
      "na",
      "is",
      "agus",
      "ar",
      "le",
      "i",
      "do",
      "de",
      "go",
      "ó",
      "a",
      "chuig",
      "sa",
      "san",
      "nach",
      "tá",
      "bhí",
      "beidh",
      "sé",
      "sí",
      "siad",
      "mé",
      "tú",
      "muid",
      "sibh",
      "mo",
      "ár",
      "bhur",
      "seo",
      "sin",
      "siúd",
      "cé",
      "cad",
      "cathain",
      "cá",
      "conas",
    ),
  },
  {
    language: "gl-ES",
    words: words(
      "o",
      "a",
      "os",
      "as",
      "de",
      "do",
      "da",
      "dos",
      "das",
      "que",
      "e",
      "en",
      "un",
      "unha",
      "para",
      "é",
      "con",
      "non",
      "se",
      "na",
      "por",
      "máis",
      "como",
      "pero",
      "foi",
      "ao",
      "el",
      "lle",
      "ten",
      "ó",
      "seu",
      "súa",
      "ou",
      "ser",
      "cando",
      "moi",
      "hai",
      "nos",
      "xa",
      "está",
      "eu",
      "tamén",
      "só",
      "polo",
      "pola",
      "ata",
      "iso",
      "ela",
      "entre",
      "era",
      "despois",
      "sen",
      "mesmo",
      "aos",
      "ter",
      "quen",
      "nas",
      "me",
      "ese",
      "eles",
      "están",
      "vostede",
      "tiña",
      "foron",
      "esa",
      "nun",
      "nin",
      "súas",
      "meu",
      "á",
      "miña",
      "teñen",
      "nunha",
    ),
  },
  {
    language: "sr-Latn-RS",
    words: words(
      "i",
      "u",
      "na",
      "je",
      "da",
      "se",
      "za",
      "od",
      "su",
      "s",
      "kao",
      "ali",
      "ili",
      "koji",
      "koja",
      "koje",
      "bio",
      "bila",
      "bilo",
      "njegov",
      "njen",
      "njihov",
      "takođe",
      "već",
      "samo",
      "još",
      "može",
      "biti",
      "ima",
      "pri",
      "kada",
      "gde",
      "ako",
    ),
    distinctiveChars: /[đćčšž]/g,
  },
];

const CYRILLIC_PROFILES: readonly WordProfile[] = [
  {
    language: "ru-RU",
    words: words(
      "и",
      "в",
      "не",
      "на",
      "что",
      "он",
      "я",
      "с",
      "как",
      "это",
      "по",
      "но",
      "из",
      "у",
      "за",
      "от",
      "так",
      "же",
      "для",
      "его",
      "она",
      "было",
      "все",
      "если",
      "или",
      "при",
      "бы",
      "еще",
      "её",
      "их",
      "к",
      "о",
      "об",
      "то",
      "меня",
      "ты",
      "мы",
      "вы",
      "они",
    ),
    distinctiveChars: RUSSIAN_CHARS,
  },
  {
    language: "uk-UA",
    words: words(
      "і",
      "й",
      "та",
      "не",
      "на",
      "що",
      "він",
      "я",
      "з",
      "як",
      "це",
      "по",
      "але",
      "із",
      "у",
      "за",
      "від",
      "так",
      "же",
      "для",
      "його",
      "вона",
      "було",
      "всі",
      "якщо",
      "або",
      "при",
      "б",
      "ще",
      "її",
      "їх",
      "до",
      "про",
      "то",
      "мене",
      "ти",
      "ми",
      "ви",
      "вони",
    ),
    distinctiveChars: UKRAINIAN_CHARS,
  },
  {
    language: "bg-BG",
    words: words(
      "и",
      "в",
      "не",
      "на",
      "че",
      "той",
      "тя",
      "с",
      "как",
      "това",
      "по",
      "но",
      "от",
      "за",
      "да",
      "се",
      "е",
      "са",
      "към",
      "при",
      "или",
      "ако",
      "ще",
      "би",
      "го",
      "му",
      "й",
      "ги",
      "им",
      "ме",
      "те",
      "ни",
      "ви",
      "ние",
      "тези",
      "този",
      "тази",
    ),
    distinctiveChars: BULGARIAN_CHARS,
  },
  {
    language: "sr-Latn-RS",
    words: words(
      "и",
      "у",
      "не",
      "на",
      "да",
      "је",
      "се",
      "као",
      "што",
      "он",
      "са",
      "за",
      "од",
      "су",
      "с",
      "али",
      "или",
      "који",
      "која",
      "које",
      "био",
      "била",
      "било",
      "његов",
      "њен",
      "њихов",
      "такође",
      "већ",
      "само",
      "још",
      "може",
      "бити",
      "има",
      "при",
      "када",
      "где",
      "ако",
    ),
    distinctiveChars: SERBIAN_CYRILLIC_CHARS,
  },
];

function count(pattern: RegExp, text: string): number {
  pattern.lastIndex = 0;
  return text.match(pattern)?.length ?? 0;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(WORD) ?? [];
}

interface ProfileScore {
  profile: WordProfile;
  occurrences: number;
  distinct: number;
  chars: number;
}

function scoreProfile(
  profile: WordProfile,
  tokens: string[],
  text: string,
): ProfileScore {
  const seen = new Set<string>();
  let occurrences = 0;
  for (const token of tokens) {
    if (!profile.words.has(token)) continue;
    occurrences++;
    seen.add(token);
  }
  const chars = profile.distinctiveChars
    ? count(profile.distinctiveChars, text)
    : 0;
  return { profile, occurrences, distinct: seen.size, chars };
}

function bestProfile(
  profiles: readonly WordProfile[],
  tokens: string[],
  text: string,
): ProfileScore | null {
  const scored = profiles
    .map((profile) => scoreProfile(profile, tokens, text))
    .filter(({ distinct, chars }) => distinct > 0 || chars > 0)
    .sort(
      (a, b) =>
        b.occurrences + b.chars * 0.35 - (a.occurrences + a.chars * 0.35) ||
        b.distinct - a.distinct,
    );
  return scored[0] ?? null;
}

/** The language the Latin-script sample is written in, or null when it is not clear. */
function detectLatin(text: string, tokens: string[]): string | null {
  const best = bestProfile(LATIN_PROFILES, tokens, text);
  if (!best || best.profile.language === "en-US") return null;

  const english = scoreProfile(LATIN_PROFILES[0], tokens, text);
  const secondBest = LATIN_PROFILES.map((profile) =>
    scoreProfile(profile, tokens, text),
  )
    .filter((score) => score.profile.language !== best.profile.language)
    .sort(
      (a, b) =>
        b.occurrences + b.chars * 0.35 - (a.occurrences + a.chars * 0.35),
    )[0];

  const distinctive =
    best.distinct >= MIN_FOREIGN_DISTINCT_WORDS || best.chars >= 3;
  const beatsEnglish =
    english.distinct < 2 ||
    best.occurrences + best.chars * 0.35 >
      (english.occurrences + english.chars * 0.35) * 1.5;
  const beatsRunnerUp =
    !secondBest ||
    best.occurrences + best.chars * 0.35 >=
      (secondBest.occurrences + secondBest.chars * 0.35) * 1.2;

  return distinctive && beatsEnglish && beatsRunnerUp
    ? best.profile.language
    : null;
}

/** A tag for the language the Cyrillic sample is written in, or null when it is not clear. */
function detectCyrillic(text: string, tokens: string[]): string | null {
  const best = bestProfile(CYRILLIC_PROFILES, tokens, text);
  if (!best) return null;

  const secondBest = CYRILLIC_PROFILES.map((profile) =>
    scoreProfile(profile, tokens, text),
  )
    .filter((score) => score.profile.language !== best.profile.language)
    .sort(
      (a, b) =>
        b.occurrences + b.chars * 0.35 - (a.occurrences + a.chars * 0.35),
    )[0];
  const distinctive =
    best.distinct >= 2 ||
    best.chars >= 2 ||
    (best.distinct >= 1 && best.chars >= 1);
  const beatsRunnerUp =
    !secondBest ||
    best.occurrences + best.chars * 0.35 >
      (secondBest.occurrences + secondBest.chars * 0.35) * 1.15;
  return distinctive && beatsRunnerUp ? best.profile.language : null;
}

function detectCjk(text: string, letters: number): string | null {
  const han = count(HAN, text);
  const kana = count(HIRAGANA, text) + count(KATAKANA, text);
  if (han + kana < Math.max(6, letters * MIN_SCRIPT_SHARE)) return null;
  if (kana >= 3 && kana / Math.max(han + kana, 1) >= 0.03) return "ja-JP";
  const traditional = count(TRADITIONAL_HAN, text);
  const simplified = count(SIMPLIFIED_HAN, text);
  return traditional >= 2 && traditional > simplified * 1.2 ? "zh-TW" : "zh-CN";
}

/**
 * The supported read-aloud tag for a text sample, or null when the sample
 * does not identify a language clearly. Arabic and Cyrillic are compared
 * against their neighbours before a tag is claimed; English is never guessed
 * here, so its caller can use it as the fallback.
 */
export function detectLanguageFromText(text: string): string | null {
  const letters = count(LETTER, text);
  if (letters < MIN_LETTERS) return null;

  const han = count(HAN, text);
  const kana = count(HIRAGANA, text) + count(KATAKANA, text);
  const cjk = han + kana;
  if (cjk >= letters * MIN_SCRIPT_SHARE) return detectCjk(text, letters);

  const scripts: [number, () => string | null][] = [
    [count(HIRAGANA, text), () => "ja-JP"],
    [count(KATAKANA, text), () => "ja-JP"],
    [count(HANGUL, text), () => "ko-KR"],
    [count(GREEK, text), () => "el-GR"],
    [count(DEVANAGARI, text), () => "hi-IN"],
    [count(THAI, text), () => "th-TH"],
    [count(MALAYALAM, text), () => "ml-ML"],
    [count(TIBETAN, text), () => "zh-BO"],
  ];
  const dominant = scripts
    .filter(
      ([lettersInScript]) => lettersInScript >= letters * MIN_SCRIPT_SHARE,
    )
    .sort(([a], [b]) => b - a)[0];
  if (dominant) return dominant[1]();

  const arabic = count(ARABIC, text);
  if (arabic >= letters * MIN_SCRIPT_SHARE) {
    return count(PERSIAN_CHARS, text) >= 2 ? "fa-IR" : "ar-AR";
  }

  const hebrew = count(HEBREW, text);
  if (hebrew >= letters * MIN_SCRIPT_SHARE) return null;

  const latin = count(LATIN, text);
  if (latin >= letters * 0.5) {
    return detectLatin(text, tokenize(text));
  }

  const cyrillic = count(CYRILLIC, text);
  if (cyrillic >= letters * MIN_SCRIPT_SHARE) {
    return detectCyrillic(text, tokenize(text));
  }

  return null;
}

function canonicalSupportedLanguage(tag: string): string | null {
  let canonical: string;
  try {
    canonical = Intl.getCanonicalLocales(tag.trim())[0] ?? "";
  } catch {
    return null;
  }
  if (!canonical) return null;

  const canonicalKey = Object.keys(supportedLanguages).find(
    (key) => Intl.getCanonicalLocales(key)[0] === canonical,
  );
  if (canonicalKey) return canonicalKey;

  const [base, ...subtags] = canonical.split("-");
  const region = subtags.find((part) => part.length === 2)?.toUpperCase();
  if (base === "no" || base === "nb" || base === "nn") return "no-NB";
  if (base === "bo") return "zh-BO";

  const baseKey = Object.keys(supportedLanguages).find(
    (key) => key.split("-")[0].toLowerCase() === base.toLowerCase(),
  );
  if (!baseKey) return null;

  if (base === "en") return region === "GB" ? "en-GB" : "en-US";
  if (base === "zh") {
    if (
      subtags.some((part) => /^Hant$/i.test(part)) ||
      region === "TW" ||
      region === "HK" ||
      region === "MO"
    ) {
      return "zh-TW";
    }
    return "zh-CN";
  }
  if (base === "pt") return region === "BR" ? "pt-BR" : "pt-PT";
  if (base === "sr") return "sr-Latn-RS";
  if (base === "ar") return "ar-AR";
  return baseKey;
}

/** The language a PDF declares in its XMP metadata, when it names a supported one. */
export function languageFromMetadata(
  metadata: { get(name: string): unknown } | null | undefined,
): string | null {
  if (!metadata) return null;
  let declared: unknown;
  try {
    declared = metadata.get("dc:language");
  } catch {
    return null;
  }
  const values = Array.isArray(declared) ? declared : [declared];
  for (const value of values) {
    if (typeof value !== "string") continue;
    for (const tag of value.split(/[\s,;]+/)) {
      const language = canonicalSupportedLanguage(tag);
      if (language) return language;
    }
  }
  return null;
}

async function sampleDocumentText(pdf: PDFDocumentProxy): Promise<string> {
  const parts: string[] = [];
  let length = 0;
  const pages = Math.min(pdf.numPages, SAMPLE_PAGE_LIMIT);
  for (let pageNumber = 1; pageNumber <= pages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!("str" in item) || typeof item.str !== "string") continue;
      parts.push(item.str);
      length += item.str.length + 1;
      if (length >= SAMPLE_LETTER_LIMIT) return parts.join(" ");
    }
  }
  return parts.join(" ");
}

/**
 * The supported read-aloud language for `file`, or English when the document
 * has too little text, no clear language, or cannot be read.
 */
export async function detectReadAloudLanguageForFile(
  file: Blob,
): Promise<string> {
  let pdf: PDFDocumentProxy | null = null;
  try {
    pdf = await pdfWorkerManager.createDocument(await file.arrayBuffer(), {
      openTimeoutMs: 10_000,
    });
    const text = await sampleDocumentText(pdf);
    const fromText = detectLanguageFromText(text);
    if (fromText) return fromText;

    const metadata = await pdf.getMetadata().catch(() => null);
    return (
      languageFromMetadata(metadata?.metadata) ?? READ_ALOUD_FALLBACK_LANGUAGE
    );
  } catch {
    return READ_ALOUD_FALLBACK_LANGUAGE;
  } finally {
    if (pdf) {
      void pdfWorkerManager.destroyDocument(pdf);
    }
  }
}
