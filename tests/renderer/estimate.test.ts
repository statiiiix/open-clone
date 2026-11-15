import { expect, it } from 'vitest';
import { estimateRemaining, progressLine } from '../../src/renderer/estimate';

it('estimates from the sentences already finished', () => {
  expect(estimateRemaining(1, 4, 120)).toBe(360);
  expect(estimateRemaining(4, 4, 400)).toBe(0);
});
it('has no estimate until one sentence is done', () => {
  expect(estimateRemaining(0, 4, 50)).toBeNull();
  expect(estimateRemaining(0, 0, 0)).toBeNull();
});
it('describes progress in plain words', () => {
  // working on sentence 2 of 5 (one finished), 3:10 in
  expect(progressLine([2, 5], 190)).toBe('Sentence 2 of 5 · 3:10 elapsed · about 13 min left');
  expect(progressLine([1, 5], 50)).toBe('Sentence 1 of 5 · 0:50 elapsed');
  expect(progressLine([3, 3], 100)).toBe('Sentence 3 of 3 · 1:40 elapsed · about 1 min left');
  expect(progressLine([1, 1], 20)).toBe('Generating · 0:20 elapsed');
  expect(progressLine(null, 5)).toBe('Loading the voice model…');
});
