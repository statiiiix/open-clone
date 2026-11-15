import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, expect, it } from 'vitest';
import { ensureModel, ensureModels, missingFiles, missingSets, MODEL_SETS, totalSize, type ModelFile, type ModelSet } from '../../src/main/modelDownload';

const FILES: ModelFile[] = [{ path: 'tokenizer.json', size: 10 }, { path: 'onnx/a.onnx_data', size: 6 }];
const BODY: Record<string, string> = { 'tokenizer.json': '0123456789', 'onnx/a.onnx_data': 'abcdef' };
let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-model-')); });

type Call = { url: string; range: string | null };
function fakeFetch(calls: Call[], opts: { failAfter?: number } = {}) {
  return (async (url: string, init?: RequestInit) => {
    const range = new Headers(init?.headers).get('range');
    calls.push({ url, range });
    const name = Object.keys(BODY).find((k) => url.endsWith(k))!;
    const from = range ? Number(/bytes=(\d+)-/.exec(range)![1]) : 0;
    const bytes = new TextEncoder().encode(BODY[name].slice(from));
    let sent = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        if (opts.failAfter === undefined) { c.enqueue(bytes); c.close(); }
        else if (!sent) { sent = true; c.enqueue(bytes.slice(0, opts.failAfter)); }
        else c.error(new Error('socket hang up'));
      },
    });
    return new Response(stream, { status: range ? 206 : 200 });
  }) as unknown as typeof fetch;
}

it('reports absent and wrong-size files as missing', () => {
  expect(missingFiles(dir, FILES)).toHaveLength(2);
  fs.writeFileSync(path.join(dir, 'tokenizer.json'), '0123456789');
  fs.mkdirSync(path.join(dir, 'onnx'));
  fs.writeFileSync(path.join(dir, 'onnx/a.onnx_data'), 'abc');
  expect(missingFiles(dir, FILES).map((f) => f.path)).toEqual(['onnx/a.onnx_data']);
});
it('downloads everything, reports progress, leaves no part files', async () => {
  const progress: number[][] = [];
  await ensureModel(dir, (d, t) => progress.push([d, t]), fakeFetch([]), FILES, 'https://x');
  expect(missingFiles(dir, FILES)).toEqual([]);
  expect(fs.readFileSync(path.join(dir, 'onnx/a.onnx_data'), 'utf8')).toBe('abcdef');
  expect(progress.at(-1)).toEqual([16, 16]);
  expect(fs.readdirSync(dir).some((f) => f.endsWith('.part'))).toBe(false);
});
it('an interrupted download leaves no final file and the next call resumes', async () => {
  await expect(ensureModel(dir, () => {}, fakeFetch([], { failAfter: 4 }), FILES, 'https://x')).rejects.toThrow();
  expect(fs.existsSync(path.join(dir, 'tokenizer.json'))).toBe(false);
  expect(fs.statSync(path.join(dir, 'tokenizer.json.part')).size).toBe(4);
  const calls: Call[] = [];
  await ensureModel(dir, () => {}, fakeFetch(calls), FILES, 'https://x');
  expect(calls[0].range).toBe('bytes=4-');
  expect(fs.readFileSync(path.join(dir, 'tokenizer.json'), 'utf8')).toBe('0123456789');
});
it('restarts a file when the server ignores the resume request', async () => {
  fs.writeFileSync(path.join(dir, 'tokenizer.json.part'), 'XXXX');
  const noRange = (async (url: string) => new Response(BODY[Object.keys(BODY).find((k) => url.endsWith(k))!], { status: 200 })) as unknown as typeof fetch;
  await ensureModel(dir, () => {}, noRange, FILES, 'https://x');
  expect(fs.readFileSync(path.join(dir, 'tokenizer.json'), 'utf8')).toBe('0123456789');
});
it('rejects a download whose size is wrong', async () => {
  const bad = (async () => new Response('short', { status: 200 })) as unknown as typeof fetch;
  await expect(ensureModel(dir, () => {}, bad, FILES, 'https://x')).rejects.toThrow(/size/i);
  expect(fs.existsSync(path.join(dir, 'tokenizer.json'))).toBe(false);
});
it('explains an offline failure', async () => {
  const offline = (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
  await expect(ensureModel(dir, () => {}, offline, FILES, 'https://x')).rejects.toThrow(/connection/i);
});
it('explains a server error', async () => {
  const down = (async () => new Response('nope', { status: 503 })) as unknown as typeof fetch;
  await expect(ensureModel(dir, () => {}, down, FILES, 'https://x')).rejects.toThrow(/503/);
});

const SETS: ModelSet[] = [
  { dir: 'models/voice', baseUrl: 'https://a.example/voice', files: [{ path: 'tokenizer.json', size: 10 }] },
  { dir: 'models/words', baseUrl: 'https://b.example/words', files: [{ path: 'onnx/a.onnx_data', size: 6 }] },
];
it('downloads every model set into its own folder with one combined progress', async () => {
  const progress: number[][] = [];
  const calls: Call[] = [];
  expect(missingSets(dir, SETS)).toHaveLength(2);
  await ensureModels(dir, (d, t) => progress.push([d, t]), fakeFetch(calls), SETS);
  expect(missingSets(dir, SETS)).toEqual([]);
  expect(fs.statSync(path.join(dir, 'models/voice/tokenizer.json')).size).toBe(10);
  expect(fs.statSync(path.join(dir, 'models/words/onnx/a.onnx_data')).size).toBe(6);
  expect(calls.map((c) => c.url)).toEqual(['https://a.example/voice/tokenizer.json', 'https://b.example/words/onnx/a.onnx_data']);
  expect(progress[0]).toEqual([0, 16]);
  expect(progress.at(-1)).toEqual([16, 16]);
  expect(progress.every(([d], i) => i === 0 || d >= progress[i - 1][0])).toBe(true);
});
it('skips a model set that is already complete', async () => {
  fs.mkdirSync(path.join(dir, 'models/voice'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'models/voice/tokenizer.json'), '0123456789');
  const calls: Call[] = [];
  const progress: number[][] = [];
  await ensureModels(dir, (d, t) => progress.push([d, t]), fakeFetch(calls), SETS);
  expect(calls).toHaveLength(1);
  expect(progress[0]).toEqual([10, 16]);
});
it('ships the voice model and the transcription model at pinned revisions', () => {
  expect(MODEL_SETS.map((s) => s.dir)).toEqual(['models/voxcpm2', 'models/whisper-small.en']);
  expect(MODEL_SETS[0].baseUrl).toBe('https://huggingface.co/openbmb/VoxCPM2/resolve/7936080b41163874f38610f46f438e2c0757f9fd');
  expect(MODEL_SETS[1].baseUrl).toBe('https://huggingface.co/Systran/faster-whisper-small.en/resolve/d1d751a5f8271d482d14ca55d9e2deeebbae577f');
  expect(totalSize()).toBe(4580080592 + 376951122 + 4336 + 3676772 + 5059 + 1632 + 2895 + 483545366 + 2128466 + 422309 + 2657);
});
