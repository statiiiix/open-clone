import { expect, it } from 'vitest';
import { checkSample } from '../../src/renderer/audio';

const noise = (sec: number) => Float32Array.from({ length: Math.round(24000 * sec) }, (_, i) => Math.sin(i / 7) * 0.3);

it('rejects a sample under 3 seconds', () => {
  expect(checkSample(noise(2.9))).toEqual({ ok: false, reason: 'too-short' });
  expect(checkSample(new Float32Array(0))).toEqual({ ok: false, reason: 'too-short' });
});
it('rejects a silent sample', () => {
  expect(checkSample(new Float32Array(24000 * 10))).toEqual({ ok: false, reason: 'silent' });
});
it('trims a long sample to the first 30 seconds', () => {
  const r = checkSample(noise(45));
  expect(r.ok && r.audio.length).toBe(24000 * 30);
});
it('accepts a normal sample unchanged', () => {
  const r = checkSample(noise(12));
  expect(r.ok && r.audio.length).toBe(24000 * 12);
});
it('rejects audio with broken values', () => {
  const a = noise(5); a[10] = NaN;
  expect(checkSample(a)).toEqual({ ok: false, reason: 'silent' });
});
