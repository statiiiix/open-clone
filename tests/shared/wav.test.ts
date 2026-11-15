import { expect, it } from 'vitest';
import { encodeWav } from '../../src/shared/wav';

it('writes a mono 16-bit WAV at the given rate', () => {
  const w = encodeWav(new Float32Array([0, 1, -1, 5]), 48000);
  const v = new DataView(w.buffer, w.byteOffset, w.byteLength);
  expect(w.length).toBe(44 + 8);
  expect(new TextDecoder().decode(w.slice(0, 4))).toBe('RIFF');
  expect(new TextDecoder().decode(w.slice(8, 12))).toBe('WAVE');
  expect(v.getUint16(22, true)).toBe(1);
  expect(v.getUint32(24, true)).toBe(48000);
  expect(v.getUint16(34, true)).toBe(16);
  expect(v.getUint32(40, true)).toBe(8);
  expect(v.getInt16(44, true)).toBe(0);
  expect(v.getInt16(46, true)).toBe(32767);
  expect(v.getInt16(48, true)).toBe(-32767);
  expect(v.getInt16(50, true)).toBe(32767); // clipped
});
