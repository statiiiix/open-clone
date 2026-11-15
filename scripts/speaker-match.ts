// Scores how closely each clip's speaker matches a reference clip (all 24 kHz mono float32 files).
// Usage: tsx scripts/speaker-match.ts <reference.f32> <clip.f32>...
import fs from 'node:fs';
import path from 'node:path';
import * as ort from 'onnxruntime-node';
import { normalizeLevel } from '../src/shared/level';

const read = (f: string) => new Float32Array(new Uint8Array(fs.readFileSync(f)).buffer);
const cos = (a: Float32Array, b: Float32Array) => {
  let d = 0, x = 0, y = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; }
  return d / Math.sqrt(x * y);
};
async function main() {
  const enc = await ort.InferenceSession.create(path.resolve('proof/model/onnx/speech_encoder.onnx'), { executionProviders: ['cpu'] });
  const xv = async (a: Float32Array) => {
    const n = normalizeLevel(a);
    const out = await enc.run({ audio_values: new ort.Tensor('float32', n, [1, n.length]) });
    return out[enc.outputNames[2]].data as Float32Array;
  };
  const [refFile, ...clips] = process.argv.slice(2);
  const ref = await xv(read(refFile));
  for (const c of clips) {
    const a = read(c);
    if (a.length < 24000 * 2) continue;
    let s = 0; for (const v of a) s += v * v;
    console.log(`${cos(ref, await xv(a)).toFixed(3)}  ${(a.length / 24000).toFixed(1).padStart(5)}s  rms ${Math.sqrt(s / a.length).toFixed(3)}  ${path.basename(c)}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
