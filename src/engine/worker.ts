// Runs in an Electron utility process so generation never blocks the window.
import fs from 'node:fs';
import { concatSamples } from '../shared/wav';
import { ChatterboxEngine, type VoicePrompt } from './chatterbox';
import type { EngineEvent, EngineRequest } from './protocol';

const port = process.parentPort;
const send = (e: EngineEvent) => port.postMessage(e);

let engine: ChatterboxEngine | null = null;
let current: { id: number; abort: AbortController } | null = null;
const voices = new Map<string, VoicePrompt>();

function readSample(file: string): Float32Array {
  const raw = fs.readFileSync(file);
  return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
}

async function voiceFor(samplePath: string): Promise<VoicePrompt> {
  const key = `${samplePath}:${fs.statSync(samplePath).mtimeMs}`;
  let prompt = voices.get(key);
  if (!prompt) {
    prompt = await engine!.prepareVoice(readSample(samplePath));
    if (voices.size >= 8) voices.delete(voices.keys().next().value!);
    voices.set(key, prompt);
  }
  return prompt;
}

async function handle(req: EngineRequest): Promise<void> {
  if (req.type === 'cancel') { current?.abort.abort(); return; }
  if (req.type === 'load') {
    engine ??= await ChatterboxEngine.load(req.modelDir, req.lmVariant);
    send({ id: req.id, type: 'loaded' });
    return;
  }
  if (!engine) throw new Error('The voice model is not loaded yet.');
  if (current) throw new Error('Another generation is already running.');
  const abort = new AbortController();
  current = { id: req.id, abort };
  try {
    const voice = await voiceFor(req.samplePath);
    const parts: Float32Array[] = [];
    for (let i = 0; i < req.chunks.length; i++) {
      send({ id: req.id, type: 'progress', chunk: i + 1, of: req.chunks.length });
      parts.push(await engine.generate(req.chunks[i], voice, req.params, { signal: abort.signal }));
    }
    send({ id: req.id, type: 'done', samples: concatSamples(parts.filter((p) => p.length > 0)) });
  } catch (err) {
    if (abort.signal.aborted) send({ id: req.id, type: 'cancelled' });
    else throw err;
  } finally {
    current = null;
  }
}

port.on('message', (e) => {
  const req = e.data as EngineRequest;
  handle(req).catch((err) => send({ id: req.id, type: 'error', message: err instanceof Error ? err.message : String(err) }));
});
