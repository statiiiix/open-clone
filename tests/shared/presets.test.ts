import { expect, it } from 'vitest';
import { PRESETS, clampParams } from '../../src/shared/presets';

it('has the six expressions in order', () => {
  expect(Object.keys(PRESETS)).toEqual(['neutral', 'happy', 'sad', 'excited', 'angry', 'calm']);
});
it('every preset is within range', () => {
  for (const p of Object.values(PRESETS)) {
    expect(clampParams(p)).toEqual({ intensity: p.intensity, variation: p.variation });
  }
});
it('clamps out-of-range values', () => {
  expect(clampParams({ intensity: 9, variation: -1 })).toEqual({ intensity: 2.0, variation: 0 });
  expect(clampParams({ intensity: 0, variation: 5 })).toEqual({ intensity: 0.25, variation: 1.2 });
});
it('treats non-numbers as the neutral preset', () => {
  expect(clampParams({ intensity: NaN, variation: NaN })).toEqual({ intensity: 0.5, variation: 0.6 });
});
