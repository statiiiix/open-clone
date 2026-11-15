import { expect, it } from 'vitest';
import { buildRecipe } from '../../src/shared/recipe';
import type { Voice } from '../../src/shared/types';

const path = (file: string) => `/voices/v1/${file}`;
const voice = (over: Partial<Voice> = {}): Voice => ({
  id: 'v1', name: 'Me', createdAt: '2026-11-15T00:00:00Z',
  samples: { neutral: 'neutral.f32' }, transcripts: { neutral: 'Hello, this is my voice.' }, ...over,
});

it('neutral continues the sample with no instruction', () => {
  expect(buildRecipe(voice(), 'neutral', path)).toEqual({
    referencePath: '/voices/v1/neutral.f32', promptPath: '/voices/v1/neutral.f32', promptText: 'Hello, this is my voice.',
  });
});

it.each([
  ['happy', '(happy, warm, smiling tone)'],
  ['sad', '(sad, slow, quiet tone)'],
  ['excited', '(excited, cheerful tone)'],
  ['angry', '(angry, forceful tone)'],
  ['calm', '(calm, soft, relaxed tone)'],
] as const)('%s puts its tone instruction first, before the transcript', (e, instruction) => {
  const r = buildRecipe(voice(), e, path);
  expect(r.promptText).toBe(instruction + 'Hello, this is my voice.');
  expect(r.promptPath).toBe('/voices/v1/neutral.f32');
  expect(r.referencePath).toBe('/voices/v1/neutral.f32');
});

it('an expression with its own sample uses that as the prompt, with no instruction', () => {
  const v = voice({ samples: { neutral: 'neutral.f32', sad: 'sad.f32' }, transcripts: { neutral: 'Hello.', sad: 'I miss those days.' } });
  expect(buildRecipe(v, 'sad', path)).toEqual({
    referencePath: '/voices/v1/neutral.f32', promptPath: '/voices/v1/sad.f32', promptText: 'I miss those days.',
  });
});

it('refuses a sample that has not been transcribed', () => {
  expect(() => buildRecipe(voice({ transcripts: {} }), 'neutral', path)).toThrow('This voice has not been transcribed yet.');
  expect(() => buildRecipe(voice({ transcripts: undefined }), 'happy', path)).toThrow('This voice has not been transcribed yet.');
  const v = voice({ samples: { neutral: 'neutral.f32', sad: 'sad.f32' } });
  expect(() => buildRecipe(v, 'sad', path)).toThrow('This voice has not been transcribed yet.');
  expect(() => buildRecipe(voice({ transcripts: { neutral: '   ' } }), 'neutral', path)).toThrow('This voice has not been transcribed yet.');
});
