import { expect, it } from 'vitest';
import { repeatsItself } from '../../src/shared/transcript';

const S = "Ezreal and Jinx teamed up with Ari, Yasuo, and Teemo to take down the enemy's nexus.";

it('flags a sample that says the same sentence over and over', () => {
  expect(repeatsItself(Array(8).fill(S).join(' '))).toBe(true);
  expect(repeatsItself(`${S} ${S.replace('Teemo', 'Timo').toUpperCase()} ${S}`)).toBe(false); // only twice word for word
  expect(repeatsItself(`${S} ${S} Something else. ${S}`)).toBe(true);
});
it('accepts ordinary speech, including a sentence said twice and short repeated phrases', () => {
  expect(repeatsItself('Hi, this is my voice. I usually speak at about this pace. Have you noticed how different a voice sounds?')).toBe(false);
  expect(repeatsItself(`${S} And then something new happened. ${S}`)).toBe(false);
  expect(repeatsItself('Yes. Yes. Yes. Okay then. Okay then. Okay then.')).toBe(false);
  expect(repeatsItself('')).toBe(false);
});
