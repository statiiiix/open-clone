// Needs the real model: OPENCLONE_MODEL_DIR=proof/model npx vitest run tests/engine
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ChatterboxEngine, normalizeText } from '../../src/engine/chatterbox';

const dir = process.env.OPENCLONE_MODEL_DIR;
const rms = (a: Float32Array) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / Math.max(1, a.length));

it('normalizes text into a sentence', () => {
  expect(normalizeText('  hello   there ')).toBe('Hello there.');
  expect(normalizeText('Done!')).toBe('Done!');
  expect(normalizeText('')).toBe('');
});

describe.skipIf(!dir)('ChatterboxEngine with the real model', () => {
  it('speaks, stops at the token cap, and aborts', async () => {
    const engine = await ChatterboxEngine.load(path.resolve(dir!), 'language_model_q4');
    // a synthetic "voice": the encoder only needs plausible audio to produce conditioning
    const ref = Float32Array.from({ length: 24000 * 5 }, (_, i) => Math.sin(i / 20) * 0.2 * Math.sin(i / 3000));
    const voice = await engine.prepareVoice(ref);
    const p = { intensity: 0.5, variation: 0 };
    const audio = await engine.generate('Hello there.', voice, p);
    expect(audio.length).toBeGreaterThan(0.4 * 24000);
    expect(audio.length).toBeLessThan(8 * 24000);
    expect(rms(audio)).toBeGreaterThan(0.005);
    const capped = await engine.generate('Hello there.', voice, p, { maxNewTokens: 5 });
    expect(capped.length).toBeGreaterThan(0);
    const ac = new AbortController();
    ac.abort();
    await expect(engine.generate('Hello.', voice, p, { signal: ac.signal })).rejects.toThrow(/abort/i);
    expect(fs.existsSync(dir!)).toBe(true);
  }, 600_000);
});
