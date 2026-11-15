/** Peak level voice samples are brought to before cloning. */
export const TARGET_PEAK = 0.9;

/**
 * Scale a clip so its loudest point sits at a normal level. The clone comes out
 * as loud as its sample, so a quiet recording would otherwise give quiet speech.
 */
export function normalizeLevel(audio: Float32Array): Float32Array {
  let peak = 0;
  for (let i = 0; i < audio.length; i++) peak = Math.max(peak, Math.abs(audio[i]));
  if (peak === 0) return audio.slice();
  const gain = TARGET_PEAK / peak;
  return audio.map((v) => v * gain);
}
