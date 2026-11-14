import { expect, it } from 'vitest';
import { concatSamples, encodeWav } from '../../src/shared/wav';

it('writes a 24 kHz mono 16-bit WAV', () => {
  const w = encodeWav(new Float32Array([0, 1, -1, 5]));
  const v = new DataView(w.buffer, w.byteOffset, w.byteLength);
  expect(w.length).toBe(44 + 8);
  expect(new TextDecoder().decode(w.slice(0, 4))).toBe('RIFF');
  expect(new TextDecoder().decode(w.slice(8, 12))).toBe('WAVE');
  expect(v.getUint16(22, true)).toBe(1);
  expect(v.getUint32(24, true)).toBe(24000);
  expect(v.getUint16(34, true)).toBe(16);
  expect(v.getUint32(40, true)).toBe(8);
  expect(v.getInt16(44, true)).toBe(0);
  expect(v.getInt16(46, true)).toBe(32767);
  expect(v.getInt16(48, true)).toBe(-32767);
  expect(v.getInt16(50, true)).toBe(32767); // clipped
});
it('joins parts with a silent gap', () => {
  expect(concatSamples([new Float32Array(10), new Float32Array(10)], 0.5).length).toBe(10 + 12000 + 10);
  expect(concatSamples([new Float32Array(10)]).length).toBe(10);
  expect(concatSamples([]).length).toBe(0);
});
