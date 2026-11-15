import { expect, test } from 'vitest';
import { coach } from '../../src/renderer/coach';

/** Level readings at 20 per second. */
const at = (level: number, seconds: number, from = 0) =>
  Array.from({ length: seconds * 20 }, (_, i) => ({ t: from + i / 20, level }));

test('says nothing critical in the first moments', () => {
  expect(coach(at(0, 1), 1).kind).toBe('starting');
});

test('healthy speech gets encouragement', () => {
  expect(coach(at(0.5, 5), 5).kind).toBe('good');
});

test('a faint voice is asked to speak up', () => {
  const hint = coach(at(0.08, 5), 5);
  expect(hint.kind).toBe('quiet');
  expect(hint.message).toMatch(/raise your voice/i);
});

test('no sound at all points at the microphone', () => {
  expect(coach(at(0.005, 5), 5).kind).toBe('silent');
});

test('distortion is flagged even when the rest was fine', () => {
  const readings = [...at(0.5, 4), ...at(1, 0.5, 4)];
  expect(coach(readings, 4.5).kind).toBe('loud');
});

test('only the last few seconds count', () => {
  const readings = [...at(0.05, 5), ...at(0.5, 3, 5)];
  expect(coach(readings, 8).kind).toBe('good');
});

test('a pause after good speech is a reminder to keep reading, not a microphone warning', () => {
  const readings = [...at(0.5, 5), ...at(0.005, 3, 5)];
  expect(coach(readings, 8).kind).toBe('paused');
});
