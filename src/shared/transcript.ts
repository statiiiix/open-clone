const MIN_WORDS = 4;
const MAX_REPEATS = 2;

/**
 * True when a sample's transcript says the same full sentence three or more times.
 * The voice model continues the pattern of its sample, so given a looped sentence it
 * repeats that sentence again instead of saying only the new text.
 */
export function repeatsItself(transcript: string): boolean {
  const counts = new Map<string, number>();
  for (const sentence of transcript.split(/[.!?]+/)) {
    const words = sentence.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, ' ').split(/\s+/).filter(Boolean);
    if (words.length < MIN_WORDS) continue;
    const key = words.join(' ');
    const n = (counts.get(key) ?? 0) + 1;
    if (n > MAX_REPEATS) return true;
    counts.set(key, n);
  }
  return false;
}
