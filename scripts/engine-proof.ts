// One-off proof: does Chatterbox ONNX run on this Mac, how fast, and does
// intensity change the delivery? Not shipped. Uses the system ffmpeg to read
// the reference voice; the app itself decodes audio in the renderer.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ChatterboxEngine } from '../src/engine/chatterbox';
import { encodeWav } from '../src/shared/wav';

const MODEL = path.resolve('proof/model');
const SR = 24000;
const TEXT = process.env.PROOF_TEXT ?? "I can't believe we finally made it, this is the best day of my life.";
const VARIANTS = (process.env.PROOF_VARIANTS ?? 'language_model_q4,language_model_fp16').split(',');
const LEVELS = (process.env.PROOF_LEVELS ?? '0.3,0.5,0.8,1.2').split(',').map(Number);
const VARIATION = Number(process.env.PROOF_VARIATION ?? 0);
const VOICE = process.env.PROOF_VOICE ?? path.join(MODEL, 'default_voice.wav');
const TAG = process.env.PROOF_TAG ?? '';
const secs = (from: number) => (Date.now() - from) / 1000;

async function main() {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', VOICE, '-ar', String(SR), '-ac', '1', '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  const audio = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
  console.log(`reference voice: ${(audio.length / SR).toFixed(1)}s`);
  const rows: string[] = [];
  for (const variant of VARIANTS) {
    let t = Date.now();
    const engine = await ChatterboxEngine.load(MODEL, variant);
    const loadS = secs(t);
    t = Date.now();
    const voice = await engine.prepareVoice(audio);
    const voiceS = secs(t);
    console.log(`${variant}: load ${loadS.toFixed(1)}s, prepare voice ${voiceS.toFixed(1)}s, rss ${(process.memoryUsage().rss / 2 ** 20).toFixed(0)} MB`);
    for (const level of LEVELS) {
      t = Date.now();
      let steps = 0;
      const wav = await engine.generate(TEXT, voice, { intensity: level, variation: VARIATION }, { onStep: (n) => (steps = n) });
      const genS = secs(t), audioS = wav.length / SR;
      fs.writeFileSync(path.resolve('proof', `${variant.replace('language_model_', '')}-${level}${TAG}.wav`), encodeWav(wav));
      const row = `${variant.padEnd(20)} intensity ${String(level).padEnd(4)} tokens ${String(steps).padEnd(4)} took ${genS.toFixed(1).padStart(6)}s  audio ${audioS.toFixed(1).padStart(5)}s  ratio ${(genS / audioS).toFixed(1)}x  rss ${(process.memoryUsage().rss / 2 ** 20).toFixed(0)} MB`;
      console.log(row);
      rows.push(row);
    }
  }
  console.log('\n' + rows.join('\n'));
}
main().catch((e) => { console.error(e); process.exit(1); });
