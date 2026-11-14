/** Make tokens that were already generated less likely, in place. */
export function applyRepetitionPenalty(logits: Float32Array, seen: Iterable<number>, penalty = 1.2): void {
  for (const t of new Set(seen)) logits[t] = logits[t] < 0 ? logits[t] * penalty : logits[t] / penalty;
}

/** temperature 0 picks the likeliest token; higher values sample more freely. */
export function pickToken(logits: Float32Array, temperature: number, rand: () => number = Math.random): number {
  let best = 0;
  for (let i = 1; i < logits.length; i++) if (logits[i] > logits[best]) best = i;
  if (!(temperature > 0)) return best;
  const max = logits[best];
  const probs = new Float64Array(logits.length);
  let sum = 0;
  for (let i = 0; i < logits.length; i++) sum += probs[i] = Math.exp((logits[i] - max) / temperature);
  let r = rand() * sum;
  for (let i = 0; i < probs.length; i++) {
    r -= probs[i];
    if (r < 0 && probs[i] > 0) return i;
  }
  return best;
}
