/** Words that carry no identifying meaning in toilet names (English and Khmer). */
const STOP_WORDS = new Set([
  'public',
  'toilet',
  'toilets',
  'wc',
  'restroom',
  'restrooms',
  'bathroom',
  'the',
  'of',
  'at',
  'near',
  'បង្គន់',
  'សាធារណៈ',
]);

export function normalizeName(name: string): string {
  return name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP_WORDS.has(w))
    .join(' ')
    .trim();
}

function bigrams(s: string): Map<string, number> {
  const compact = s.replace(/\s+/g, ' ');
  const map = new Map<string, number>();
  for (let i = 0; i < compact.length - 1; i++) {
    const g = compact.slice(i, i + 2);
    map.set(g, (map.get(g) ?? 0) + 1);
  }
  return map;
}

/** Sørensen–Dice coefficient on character bigrams of normalised names (0 … 1). Works for Khmer and Latin. */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.length < 2 || nb.length < 2) return 0;
  const ga = bigrams(na);
  const gb = bigrams(nb);
  let overlap = 0;
  for (const [g, count] of ga) overlap += Math.min(count, gb.get(g) ?? 0);
  const total = [...ga.values()].reduce((x, y) => x + y, 0) + [...gb.values()].reduce((x, y) => x + y, 0);
  return total === 0 ? 0 : (2 * overlap) / total;
}
