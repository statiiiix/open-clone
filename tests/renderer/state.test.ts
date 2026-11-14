import { expect, it } from 'vitest';
import { canGenerate, initialComposer, selectExpression } from '../../src/renderer/state';

const base = initialComposer();
it('starts on the neutral preset', () => {
  expect(base.expression).toBe('neutral');
  expect(base.params).toEqual({ intensity: 0.5, variation: 0.6 });
});
it('only allows generating with text, a voice, and nothing running', () => {
  expect(canGenerate({ ...base, text: '   ' }, 'v1')).toBe(false);
  expect(canGenerate({ ...base, text: 'Hi' }, null)).toBe(false);
  expect(canGenerate({ ...base, text: 'Hi', busy: true }, 'v1')).toBe(false);
  expect(canGenerate({ ...base, text: 'Hi' }, 'v1')).toBe(true);
});
it('selecting an expression loads its preset', () => {
  const s = selectExpression({ ...base, text: 'keep me' }, 'excited');
  expect(s.params).toEqual({ intensity: 1.2, variation: 0.9 });
  expect(s.expression).toBe('excited');
  expect(s.text).toBe('keep me');
});
