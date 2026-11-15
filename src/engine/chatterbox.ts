import { Tokenizer } from '@huggingface/tokenizers';
import fs from 'node:fs';
import path from 'node:path';
import * as ort from 'onnxruntime-node';
import { normalizeLevel } from '../shared/level';
import type { GenParams } from '../shared/types';
import { applyRepetitionPenalty, pickToken } from './sampling';

// Constants of the onnx-community/chatterbox-ONNX export.
const START_SPEECH = 6561;
const STOP_SPEECH = 6562;
const KV_HEADS = 16;
const HEAD_DIM = 64;
const REPETITION_PENALTY = 1.2;

/** Upper bound on speech tokens per chunk (25 per second of audio), so generation always ends. */
export const MAX_NEW_TOKENS = 1000;

const MAX_VOICE_SAMPLES = 30 * 24000;

export interface VoicePrompt {
  condEmb: ort.Tensor;
  promptToken: ort.Tensor;
  xVector: ort.Tensor;
  promptFeat: ort.Tensor;
}

export interface GenerateOptions {
  maxNewTokens?: number;
  signal?: AbortSignal;
  onStep?: (tokens: number) => void;
}

type KvType = 'float32' | 'float16';

function f16to32(u: Uint16Array): Float32Array {
  const out = new Float32Array(u.length);
  for (let i = 0; i < u.length; i++) {
    const h = u[i], sign = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff;
    out[i] = e === 0 ? sign * 2 ** -14 * (f / 1024) : e === 31 ? (f ? NaN : sign * Infinity) : sign * 2 ** (e - 15) * (1 + f / 1024);
  }
  return out;
}
const asF32 = (t: ort.Tensor): Float32Array => (t.type === 'float16' ? f16to32(t.data as Uint16Array) : (t.data as Float32Array));
const i64 = (values: number[], dims: number[]) => new ort.Tensor('int64', BigInt64Array.from(values, BigInt), dims);
const emptyKv = (type: KvType) =>
  type === 'float16'
    ? new ort.Tensor('float16', new Uint16Array(0), [1, KV_HEADS, 0, HEAD_DIM])
    : new ort.Tensor('float32', new Float32Array(0), [1, KV_HEADS, 0, HEAD_DIM]);

/** The model was trained on sentence-like text: tidy spacing and make sure it ends. */
export function normalizeText(text: string): string {
  let t = text.replace(/\s+/g, ' ').trim();
  if (!t) return t;
  t = t[0].toUpperCase() + t.slice(1);
  if (!/[.!?,;:\-'")\]]$/.test(t)) t += '.';
  return t;
}

export class ChatterboxEngine {
  private kvType: KvType = 'float32';

  private constructor(
    private tokenizer: Tokenizer,
    private speechEncoder: ort.InferenceSession,
    private embed: ort.InferenceSession,
    private lm: ort.InferenceSession,
    private decoder: ort.InferenceSession,
  ) {}

  static async load(modelDir: string, lmVariant: string): Promise<ChatterboxEngine> {
    const json = (name: string) => JSON.parse(fs.readFileSync(path.join(modelDir, name), 'utf8'));
    const session = (name: string) =>
      ort.InferenceSession.create(path.join(modelDir, 'onnx', `${name}.onnx`), { executionProviders: ['cpu'] });
    const tokenizer = new Tokenizer(json('tokenizer.json'), json('tokenizer_config.json'));
    // Loaded one after another: loading in parallel doubles peak memory.
    const speechEncoder = await session('speech_encoder');
    const embed = await session('embed_tokens');
    const lm = await session(lmVariant);
    const decoder = await session('conditional_decoder');
    return new ChatterboxEngine(tokenizer, speechEncoder, embed, lm, decoder);
  }

  /** Turn a 24 kHz mono clip into the conditioning the model speaks with. */
  async prepareVoice(audio24k: Float32Array): Promise<VoicePrompt> {
    // This model conditions on the start of the clip; more than 30 s only costs time and memory.
    const audio = normalizeLevel(audio24k.length > MAX_VOICE_SAMPLES ? audio24k.subarray(0, MAX_VOICE_SAMPLES) : audio24k);
    const out = await this.speechEncoder.run({ audio_values: new ort.Tensor('float32', audio, [1, audio.length]) });
    const [condEmb, promptToken, xVector, promptFeat] = this.speechEncoder.outputNames.map((n) => out[n]);
    return { condEmb, promptToken, xVector, promptFeat };
  }

  /** Speak one chunk of text. Returns 24 kHz mono samples. */
  async generate(text: string, voice: VoicePrompt, params: GenParams, opts: GenerateOptions = {}): Promise<Float32Array> {
    const maxNew = opts.maxNewTokens ?? MAX_NEW_TOKENS;
    const checkAbort = () => { if (opts.signal?.aborted) throw new Error('Generation aborted'); };
    checkAbort();

    const ids = this.tokenizer.encode(normalizeText(text)).ids as number[];
    const exaggeration = new ort.Tensor('float32', Float32Array.from([params.intensity]), [1]);
    const embedIds = async (tokenIds: number[], positions: number[]) =>
      (await this.embed.run({ input_ids: i64(tokenIds, [1, tokenIds.length]), position_ids: i64(positions, [1, positions.length]), exaggeration }))[
        this.embed.outputNames[0]
      ];

    // First pass: voice conditioning followed by the text.
    const textEmb = await embedIds(ids, ids.map((id, i) => (id >= START_SPEECH ? 0 : i - 1)));
    const cond = asF32(voice.condEmb), txt = asF32(textEmb);
    const joined = new Float32Array(cond.length + txt.length);
    joined.set(cond, 0);
    joined.set(txt, cond.length);
    let embeds: ort.Tensor = new ort.Tensor('float32', joined, [1, voice.condEmb.dims[1] + textEmb.dims[1], textEmb.dims[2]]);

    const kvNames = this.lm.inputNames.filter((n) => n.startsWith('past_key_values'));
    const presentNames = this.lm.outputNames.slice(1);
    let past: Record<string, ort.Tensor> = Object.fromEntries(kvNames.map((n) => [n, emptyKv(this.kvType)]));
    let seqLen = embeds.dims[1];
    const generated = [START_SPEECH];

    for (let step = 0; step < maxNew; step++) {
      checkAbort();
      const feeds = () => ({ inputs_embeds: embeds, attention_mask: new ort.Tensor('int64', new BigInt64Array(seqLen).fill(1n), [1, seqLen]), ...past });
      let res: ort.InferenceSession.ReturnType;
      try {
        res = await this.lm.run(feeds());
      } catch (err) {
        if (step !== 0 || this.kvType === 'float16') throw err;
        // Half-precision variants take a half-precision cache.
        this.kvType = 'float16';
        past = Object.fromEntries(kvNames.map((n) => [n, emptyKv('float16')]));
        res = await this.lm.run(feeds());
      }
      const logitsT = res[this.lm.outputNames[0]];
      const vocab = logitsT.dims[2];
      const all = asF32(logitsT);
      const logits = all.slice(all.length - vocab);
      applyRepetitionPenalty(logits, generated, REPETITION_PENALTY);
      const next = pickToken(logits, params.variation);
      generated.push(next);
      opts.onStep?.(step + 1);
      if (next === STOP_SPEECH) break;
      past = Object.fromEntries(presentNames.map((n, k) => [kvNames[k], res[n]]));
      embeds = await embedIds([next], [step + 1]);
      seqLen += 1;
    }

    const body = generated.slice(1).filter((t) => t < START_SPEECH);
    if (body.length === 0) return new Float32Array(0);
    const prompt = Array.from(voice.promptToken.data as BigInt64Array, Number);
    const tokens = [...prompt, ...body];
    checkAbort();
    const out = await this.decoder.run({
      speech_tokens: i64(tokens, [1, tokens.length]),
      speaker_embeddings: voice.xVector,
      speaker_features: voice.promptFeat,
    });
    return asF32(out[this.decoder.outputNames[0]]).slice();
  }
}
