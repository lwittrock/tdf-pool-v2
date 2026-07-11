/**
 * Rider-name normalization helpers.
 *
 * riderNameKey: case-insensitive, whitespace-normalized — the production
 * matching key (entry UI offers DB names, so accents match themselves).
 *
 * foldedRiderNameKey: additionally strips accents/diacritics — for matching
 * external sources (the 2026 Excel fixtures are ASCII-folded and
 * case-inconsistent: "TADEJ POGACAR" vs "Tadej Pogacar", "Grossschartner"
 * without umlaut) against properly accented DB names.
 */

export function riderNameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toUpperCase();
}

const SPECIAL_FOLDS: Record<string, string> = {
  Æ: 'AE',
  Ø: 'O',
  Đ: 'D',
  Ð: 'D',
  Þ: 'TH',
  ẞ: 'SS',
  Œ: 'OE',
  Ł: 'L',
};

export function foldedRiderNameKey(name: string): string {
  return riderNameKey(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // combining diacritics
    .replace(/[ÆØĐÐÞẞŒŁ]/g, (ch) => SPECIAL_FOLDS[ch] ?? ch);
}
