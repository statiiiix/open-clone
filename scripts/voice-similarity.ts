// Measures how close a clone is to its reference voice: cosine similarity of the
// model's own speaker embedding (x-vector) for the reference and for the generated clip.
// Usage: tsx scripts/voice-similarity.ts <reference.f32 (24 kHz mono float32)>
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ChatterboxEngine } from '../src/engine/chatterbox';
import { encodeWav } from '../src/shared/wav';

const MODEL = path.resolve('proof/model');
const SR = 24000;
const TEXT = process.env.SIM_TEXT ?? 'Hello, my name is Ahmad, and this is a test of how closely this copy matches my real voice.';
const CONDS = (process.env.SIM_CONDS ?? 'default,raw,loud,loud10').split(',');

const cos = (a: Float32Array, b: Float32Array) => {
  let d = 0, x = 0, y = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; }
  return d / Math.sqrt(x * y);
};
const peakTo = (a: Float32Array, target: number) => {
  let p = 0;
  for (const v of a) p = Math.max(p, Math.abs(v));
  return p ? a.map((v) => (v * target) / p) : a;
};
/** Drop leading/trailing quiet 20 ms frames (relative to the loudest frame). */
const trim = (a: Float32Array) => {
  const n = SR / 50, rms: number[] = [];
  for (let i = 0; i + n <= a.length; i += n) { let s = 0; for (let j = i; j < i + n; j++) s += a[j] * a[j]; rms.push(Math.sqrt(s / n)); }
  const thr = Math.max(...rms) * 0.05;
  const first = rms.findIndex((r) => r > thr), last = rms.length - 1 - [...rms].reverse().findIndex((r) => r > thr);
  return a.slice(first * n, (last + 1) * n);
};

async function main() {
  const ref = new Float32Array(new Uint8Array(fs.readFileSync(process.argv[2])).buffer);
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', path.join(MODEL, 'default_voice.wav'), '-ar', String(SR), '-ac', '1', '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  const def = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
  const engine = await ChatterboxEngine.load(MODEL, 'language_model_q4');
  const xv = async (a: Float32Array) => (await engine.prepareVoice(a)).xVector.data as Float32Array;
  const refX = await xv(peakTo(trim(ref), 0.9)), defX = await xv(def);
  console.log(`floor: your sample vs the built-in voice (different people) = ${cos(refX, defX).toFixed(3)}`);
  console.log(`self:  your sample, first half vs second half = ${cos(await xv(peakTo(ref.slice(0, ref.length / 2), 0.9)), await xv(peakTo(ref.slice(ref.length / 2), 0.9))).toFixed(3)}`);
  const inputs: Record<string, Float32Array> = {
    default: def,
    raw: ref,
    loud: peakTo(ref, 0.9),
    loud10: peakTo(trim(ref), 0.9).slice(0, 10 * SR),
  };
  for (const name of CONDS) {
    const t = Date.now();
    const voice = await engine.prepareVoice(inputs[name]);
    const wav = await engine.generate(TEXT, voice, { intensity: 0.5, variation: Number(process.env.SIM_VARIATION ?? 0.6) });
    fs.writeFileSync(path.resolve('proof', `sim-${name}.wav`), encodeWav(wav));
    const outX = await xv(peakTo(wav, 0.9));
    const target = name === 'default' ? defX : refX;
    console.log(`${name.padEnd(8)} similarity to its reference = ${cos(outX, target).toFixed(3)}  (clip ${(wav.length / SR).toFixed(1)}s, took ${((Date.now() - t) / 1000).toFixed(0)}s)`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
