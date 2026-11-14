import { SAMPLE_RATE } from './types';

/** Mono 16-bit PCM WAV. Samples outside [-1, 1] are clipped. */
export function encodeWav(samples: Float32Array, sampleRate: number = SAMPLE_RATE): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const v = new DataView(bytes.buffer);
  const ascii = (offset: number, s: string) => { for (let i = 0; i < s.length; i++) bytes[offset + i] = s.charCodeAt(i); };
  ascii(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); ascii(8, 'WAVEfmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  ascii(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] || 0));
    v.setInt16(44 + i * 2, Math.round(s * 32767), true);
  }
  return bytes;
}

/** Join clips with a short silence between them. */
export function concatSamples(parts: Float32Array[], gapSec = 0.15, sampleRate: number = SAMPLE_RATE): Float32Array {
  const gap = Math.round(gapSec * sampleRate);
  const total = parts.reduce((n, p) => n + p.length, 0) + gap * Math.max(0, parts.length - 1);
  const out = new Float32Array(total);
  let at = 0;
  parts.forEach((p, i) => { out.set(p, at); at += p.length + (i < parts.length - 1 ? gap : 0); });
  return out;
}
