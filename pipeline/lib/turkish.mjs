// Turkish title-case for SCREAMING stop names. İETT writes every stop name in
// caps and the rail feed about a quarter of them. Unlike Greek (the Athens map
// needs an OSM dictionary because Greek capitals drop the accents), Turkish
// capitals lose nothing and the feeds spell dotted/dotless İ/I correctly — a
// locale-aware recase reconstructs the exact street-sign form: 'İ'→'i',
// 'I'→'ı' (RIFAT ILGAZ CADDESİ → Rıfat Ilgaz Caddesi).
//
// The dot is a separator too — the feed glues titles to names ("DR.İFFET",
// "DOÇ.DR.BURHAN"), so tokens are split on it and recased one by one.
// A vowel-less alpha token is never a Turkish word: title/street
// abbreviations from ABBR_TITLE recase like words ("DR"→"Dr", "ŞHT"→"Şht",
// "SK"→"Sk"), every other vowel-less token stays caps (PTT, SGK, FSM, YHT,
// ŞH — the rail feed itself writes "Anadolu Hisarı ŞH." — and lone
// initials, "M."), as do tokens with digits (D100) and the vowel-carrying
// acronyms below. "VE" recases to lowercase "ve". Suffixes after an
// apostrophe stay lowercase by construction (ATATÜRK'ÜN → Atatürk'ün),
// which is exactly Turkish orthography.

const ACRONYMS = new Set([
  'İETT', 'İDO', 'İBB', 'İSKİ', 'İGDAŞ', 'İSPARK', 'İSFALT', 'KİPTAŞ',
  'TOKİ', 'AVM', 'TEM', 'İTÜ', 'YTÜ', 'İÜ', 'THY', 'TCDD', 'TRT', 'TÜYAP',
  'İMKB', 'İÖO', 'İHL', 'EML', 'ATL', 'MTAL',
]);
// vowel-less abbreviations that read as words on street signs, not acronyms
const ABBR_TITLE = new Set([
  'DR', 'HZ', 'ŞHT', 'YRD', 'UZM', 'SK', 'CD', 'MH', 'MRK', 'MRKZ',
  'HST', 'BLD', 'MD',
]);

const VOWEL = /[AEIİOÖUÜ]/;
const lower = (s) => s.toLocaleLowerCase('tr-TR');
const title = (w) => lower(w).replace(/^\p{L}/u, (c) => c.toLocaleUpperCase('tr-TR'));

export function turkishTitleCase(name) {
  if (!name || /\p{Ll}/u.test(name)) return name; // already mixed-case — leave
  return name.split(/(\s+|[/().\-–,+&])/).map((tok) => {
    if (!/\p{L}/u.test(tok)) return tok; // separators, bare numbers
    if (/\d/.test(tok)) return tok; // D100 and friends
    if (ACRONYMS.has(tok)) return tok;
    if (ABBR_TITLE.has(tok)) return title(tok);
    if (!VOWEL.test(tok)) return tok; // other vowel-less = acronym/initial
    if (tok === 'VE') return 've';
    return title(tok);
  }).join('');
}
