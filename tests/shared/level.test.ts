import { expect, test } from 'vitest';
import { normalizeLevel } from '../../src/shared/level';

const peak = (a: Float32Array) => a.reduce((p, v) => Math.max(p, Math.abs(v)), 0);

test('a quiet clip is raised to a normal level', () => {
  const out = normalizeLevel(Float32Array.from([0.01, -0.08, 0.04]));
  expect(peak(out)).toBeCloseTo(0.9, 5);
  expect(out[0] / out[2]).toBeCloseTo(0.25, 5);
});

test('a loud clip is brought down', () => {
  expect(peak(normalizeLevel(Float32Array.from([1, -0.5])))).toBeCloseTo(0.9, 5);
});

test('silence is left alone and the input is not modified', () => {
  const silent = new Float32Array(4);
  expect(Array.from(normalizeLevel(silent))).toEqual([0, 0, 0, 0]);
  const a = Float32Array.from([0.1, 0.2]);
  normalizeLevel(a);
  expect(a[1]).toBeCloseTo(0.2, 6);
});
