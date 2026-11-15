import { expect, it } from 'vitest';
import { checkSample } from '../../src/renderer/audio';

const noise = (sec: number) => Float32Array.from({ length: Math.round(24000 * sec) }, (_, i) => Math.sin(i / 7) * 0.3);

it('rejects a voice sample under one minute', () => {
  expect(checkSample(noise(59.9))).toEqual({ ok: false, reason: 'too-short' });
  const full = checkSample(noise(60));
  expect(full.ok && full.audio.length).toBe(24000 * 60);
  expect(checkSample(new Float32Array(0))).toEqual({ ok: false, reason: 'too-short' });
});
it('allows a shorter minimum for expression samples', () => {
  expect(checkSample(noise(9.9), 10)).toEqual({ ok: false, reason: 'too-short' });
  expect(checkSample(noise(12), 10).ok).toBe(true);
});
it('rejects a silent sample', () => {
  expect(checkSample(new Float32Array(24000 * 60))).toEqual({ ok: false, reason: 'silent' });
});
it('trims a long sample to the first minute', () => {
  const r = checkSample(noise(75));
  expect(r.ok && r.audio.length).toBe(24000 * 60);
});
it('accepts a normal sample unchanged', () => {
  const r = checkSample(noise(12), 10);
  expect(r.ok && r.audio.length).toBe(24000 * 12);
});
it('rejects audio with broken values', () => {
  const a = noise(12); a[10] = NaN;
  expect(checkSample(a, 10)).toEqual({ ok: false, reason: 'silent' });
});
it('warns about quiet and distorted samples without rejecting them', () => {
  const quiet = checkSample(noise(12).map((v) => v * 0.05), 10);
  expect(quiet.ok && quiet.warnings).toEqual(['quiet']);
  const clipped = checkSample(noise(12).map((v) => Math.max(-1, Math.min(1, v * 8))), 10);
  expect(clipped.ok && clipped.warnings).toEqual(['clipped']);
  const fine = checkSample(noise(12), 10);
  expect(fine.ok && fine.warnings).toEqual([]);
});
