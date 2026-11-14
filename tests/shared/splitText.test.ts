import { describe, expect, it } from 'vitest';
import { splitText } from '../../src/shared/splitText';

describe('splitText', () => {
  it('returns nothing for empty or whitespace text', () => {
    expect(splitText('')).toEqual([]);
    expect(splitText('   \n ')).toEqual([]);
  });
  it('merges short sentences up to the limit', () => {
    expect(splitText('Hi there. How are you? Fine!')).toEqual(['Hi there. How are you? Fine!']);
  });
  it('splits on sentence ends when over the limit', () => {
    expect(splitText('One two three. Four five six.', 16)).toEqual(['One two three.', 'Four five six.']);
  });
  it('breaks a long unpunctuated run on spaces without losing words', () => {
    const long = Array(80).fill('word').join(' ');
    const parts = splitText(long);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 250)).toBe(true);
    expect(parts.join(' ')).toBe(long);
  });
  it('prefers commas over spaces', () => {
    expect(splitText('a, b, c, d', 4)).toEqual(['a,', 'b,', 'c, d']);
  });
  it('keeps a single word longer than the limit whole', () => {
    expect(splitText('abcdefghij', 4)).toEqual(['abcdefghij']);
  });
  it('collapses newlines and repeated spaces', () => {
    expect(splitText('Hello\n\nworld.   Bye.')).toEqual(['Hello world. Bye.']);
  });
});
