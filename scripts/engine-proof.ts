// One-off proof: does Chatterbox ONNX run on this Mac, how fast, and does
// intensity change the delivery? Not shipped. Uses the system ffmpeg to
// read the reference voice; the app itself decodes audio in the renderer.
import * as ort from 'onnxruntime-node';
import { Tokenizer } from '@huggingface/tokenizers';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const MODEL = path.resolve('proof/model');
const OUT = path.resolve('proof');
const SR = 24000;
const START_SPEECH = 6561;
const STOP_SPEECH = 6562;
const LAYERS = 30, KV_HEADS = 16, HEAD_DIM = 64;
const REP_PENALTY = 1.2;
const MAX_NEW = 600;

const TEXT = process.env.PROOF_TEXT ?? "I can't believe we finally made it, this is the best day of my life.";
const VARIANTS = (process.env.PROOF_VARIANTS ?? 'language_model_q4,language_model_fp16').split(',');
const LEVELS = (process.env.PROOF_LEVELS ?? '0.3,0.5,0.8,1.2').split(',').map(Number);
const VOICE = process.env.PROOF_VOICE ?? path.join(MODEL, 'default_voice.wav');

function f16to32(u: Uint16Array): Float32Array {
  const out = new Float32Array(u.length);
  for (let i = 0; i < u.length; i++) {
    const h = u[i], s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff;
    out[i] = e === 0 ? s * 2 ** -14 * (f / 1024) : e === 31 ? (f ? NaN : s * Infinity) : s * 2 ** (e - 15) * (1 + f / 1024);
  }
  return out;
}
const asF32 = (t: ort.Tensor) => (t.type === 'float16' ? f16to32(t.data as Uint16Array) : (t.data as Float32Array));
const i64 = (vals: number[], dims: number[]) => new ort.Tensor('int64', BigInt64Array.from(vals.map(BigInt)), dims);

function encodeWav(samples: Float32Array): Buffer {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  return buf;
}

async function main() {
  const opts: ort.InferenceSession.SessionOptions = { executionProviders: ['cpu'] };
  const onnx = (n: string) => path.join(MODEL, 'onnx', `${n}.onnx`);
  const tok = new Tokenizer(
    JSON.parse(fs.readFileSync(path.join(MODEL, 'tokenizer.json'), 'utf8')),
    JSON.parse(fs.readFileSync(path.join(MODEL, 'tokenizer_config.json'), 'utf8')),
  );
  const ids = tok.encode(TEXT).ids as number[];
  console.log('text ids:', ids.length, 'last:', ids.slice(-3));

  let t = Date.now();
  const speechEnc = await ort.InferenceSession.create(onnx('speech_encoder'), opts);
  const embed = await ort.InferenceSession.create(onnx('embed_tokens'), opts);
  const decoder = await ort.InferenceSession.create(onnx('conditional_decoder'), opts);
  console.log(`load encoder+embed+decoder: ${((Date.now() - t) / 1000).toFixed(1)}s`);

  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', VOICE, '-ar', String(SR), '-ac', '1', '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  const audio = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4).slice();
  console.log(`reference voice: ${(audio.length / SR).toFixed(1)}s`);
  t = Date.now();
  const enc = await speechEnc.run({ audio_values: new ort.Tensor('float32', audio, [1, audio.length]) });
  const [condEmb, promptToken, xVector, promptFeat] = speechEnc.outputNames.map((n) => enc[n]);
  console.log(`prepare voice: ${((Date.now() - t) / 1000).toFixed(1)}s`, 'outputs:', speechEnc.outputNames, condEmb.dims, promptToken.dims);

  const rows: string[] = [];
  for (const variant of VARIANTS) {
    t = Date.now();
    const lm = await ort.InferenceSession.create(onnx(variant), opts);
    const loadS = (Date.now() - t) / 1000;
    const kvNames = lm.inputNames.filter((n) => n.startsWith('past_key_values'));
    const presentNames = lm.outputNames.slice(1);
    for (const level of LEVELS) {
      const t0 = Date.now();
      const exaggeration = new ort.Tensor('float32', Float32Array.from([level]), [1]);
      const pos = ids.map((id, i) => (id >= START_SPEECH ? 0 : i - 1));
      let emb = (await embed.run({ input_ids: i64(ids, [1, ids.length]), position_ids: i64(pos, [1, ids.length]), exaggeration }))[embed.outputNames[0]];
      // prepend the voice conditioning
      const c = asF32(condEmb), e = asF32(emb), H = emb.dims[2];
      const joined = new Float32Array(c.length + e.length); joined.set(c, 0); joined.set(e, c.length);
      emb = new ort.Tensor('float32', joined, [1, condEmb.dims[1] + emb.dims[1], H]);

      let past: Record<string, ort.Tensor> = {};
      const kvType = variant.includes('16') ? 'float16' : 'float32';
      for (const n of kvNames) past[n] = kvType === 'float16'
        ? new ort.Tensor('float16', new Uint16Array(0), [1, KV_HEADS, 0, HEAD_DIM])
        : new ort.Tensor('float32', new Float32Array(0), [1, KV_HEADS, 0, HEAD_DIM]);
      let seqLen = emb.dims[1];
      const generated = [START_SPEECH];
      for (let i = 0; i < MAX_NEW; i++) {
        const mask = new ort.Tensor('int64', new BigInt64Array(seqLen).fill(1n), [1, seqLen]);
        let res: Record<string, ort.Tensor>;
        try {
          res = await lm.run({ inputs_embeds: emb, attention_mask: mask, ...past });
        } catch (err) {
          if (i === 0 && kvType === 'float16') { // fp16 graph that keeps float32 I/O
            for (const n of kvNames) past[n] = new ort.Tensor('float32', new Float32Array(0), [1, KV_HEADS, 0, HEAD_DIM]);
            res = await lm.run({ inputs_embeds: emb, attention_mask: mask, ...past });
          } else throw err;
        }
        const logitsT = res[lm.outputNames[0]];
        const V = logitsT.dims[2], all = asF32(logitsT);
        const logits = all.subarray(all.length - V);
        for (const tkn of new Set(generated)) logits[tkn] = logits[tkn] < 0 ? logits[tkn] * REP_PENALTY : logits[tkn] / REP_PENALTY;
        let next = 0; for (let k = 1; k < V; k++) if (logits[k] > logits[next]) next = k;
        generated.push(next);
        if (next === STOP_SPEECH) break;
        past = {}; presentNames.forEach((n, k) => (past[kvNames[k]] = res[n]));
        emb = (await embed.run({ input_ids: i64([next], [1, 1]), position_ids: i64([i + 1], [1, 1]), exaggeration }))[embed.outputNames[0]];
        seqLen += 1;
      }
      const lmS = (Date.now() - t0) / 1000;
      const body = generated.slice(1, generated[generated.length - 1] === STOP_SPEECH ? -1 : undefined);
      const prompt = Array.from(promptToken.data as BigInt64Array, Number);
      const tokens = [...prompt, ...body];
      const t1 = Date.now();
      const wavT = (await decoder.run({ speech_tokens: i64(tokens, [1, tokens.length]), speaker_embeddings: xVector, speaker_features: promptFeat }))[decoder.outputNames[0]];
      const decS = (Date.now() - t1) / 1000;
      const wav = asF32(wavT);
      const file = path.join(OUT, `${variant.replace('language_model_', '')}-${level}.wav`);
      fs.writeFileSync(file, encodeWav(wav));
      const audioS = wav.length / SR, total = lmS + decS;
      const row = `${variant.padEnd(22)} level ${String(level).padEnd(4)} tokens ${String(body.length).padEnd(4)} lm ${lmS.toFixed(1)}s dec ${decS.toFixed(1)}s audio ${audioS.toFixed(1)}s ratio ${(total / audioS).toFixed(1)}x ${generated.at(-1) === STOP_SPEECH ? '' : '(hit cap)'}`;
      console.log(row); rows.push(row);
    }
    console.log(`(${variant} load ${loadS.toFixed(1)}s)`);
    await lm.release();
  }
  console.log('\n' + rows.join('\n'));
}
main().catch((e) => { console.error(e); process.exit(1); });
