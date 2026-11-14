import { expect, it } from 'vitest';
import { applyRepetitionPenalty, pickToken } from '../../src/engine/sampling';

it('penalises tokens already generated, once each', () => {
  const l = new Float32Array([2, -2, 0]);
  applyRepetitionPenalty(l, [0, 1, 0], 2);
  expect(Array.from(l)).toEqual([1, -4, 0]);
});
it('picks the likeliest token at zero variation', () => {
  expect(pickToken(new Float32Array([0.1, 5, 0.2]), 0)).toBe(1);
});
it('samples by probability when variation is above zero', () => {
  expect(pickToken(new Float32Array([0, 0, 0]), 1, () => 0.99)).toBe(2);
  expect(pickToken(new Float32Array([0, 0, 0]), 1, () => 0.0)).toBe(0);
  expect(pickToken(new Float32Array([0, 0, 0]), 1, () => 0.5)).toBe(1);
});
it('never picks an impossible token and survives extreme logits', () => {
  expect(pickToken(new Float32Array([-Infinity, 1000, -Infinity]), 1, () => 0.999999)).toBe(1);
  expect(pickToken(new Float32Array([1000, 999, -1000]), 0.01, () => 0.5)).toBe(0);
});
it('low variation concentrates on the likeliest token', () => {
  let hits = 0, seed = 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 500; i++) if (pickToken(new Float32Array([1, 2, 1]), 0.1, rand) === 1) hits++;
  expect(hits).toBeGreaterThan(490);
});
