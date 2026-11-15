import { expect, it } from 'vitest';
import { canGenerate, initialComposer, selectExpression, withProgress } from '../../src/renderer/state';

const base = initialComposer();
it('starts on neutral', () => {
  expect(base.expression).toBe('neutral');
});
it('only allows generating with text, a voice, and nothing running', () => {
  expect(canGenerate({ ...base, text: '   ' }, 'v1')).toBe(false);
  expect(canGenerate({ ...base, text: 'Hi' }, null)).toBe(false);
  expect(canGenerate({ ...base, text: 'Hi', busy: true }, 'v1')).toBe(false);
  expect(canGenerate({ ...base, text: 'Hi' }, 'v1')).toBe(true);
});
it('selecting an expression keeps the text', () => {
  const s = selectExpression({ ...base, text: 'keep me' }, 'excited');
  expect(s.expression).toBe('excited');
  expect(s.text).toBe('keep me');
});
it('remembers when the first sentence started', () => {
  const a = withProgress({ ...base, busy: true }, 1, 3, 1000);
  expect(a.progress).toEqual([1, 3]);
  expect(a.speakingSince).toBe(1000);
  expect(withProgress(a, 2, 3, 9000).speakingSince).toBe(1000);
});
