import { EventEmitter } from 'node:events';
import { expect, test, vi } from 'vitest';
import { CancelledError, EngineHost, type GenerateJob } from '../../src/main/engineHost';

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  sent: any[] = [];
  killed = false;
  stdin = { write: (line: string) => { this.sent.push(JSON.parse(line)); return true; } };
  kill() { this.killed = true; queueMicrotask(() => this.emit('exit', null)); return true; }
  say(event: object) { this.stdout.emit('data', Buffer.from(JSON.stringify(event) + '\n')); }
}

const paths = { python: '/py', script: '/engine.py', modelDir: '/m', whisperDir: '/w' };
const job: GenerateJob = { chunks: ['One.', 'Two.'], referencePath: '/r.f32', promptPath: '/p.f32', promptText: 'Hi.', outPath: '/o.f32' };
const tick = () => new Promise((r) => setTimeout(r, 0));

function setup() {
  const children: FakeChild[] = [];
  const spawn = vi.fn(() => { const c = new FakeChild(); children.push(c); return c; });
  const host = new EngineHost(paths, spawn as any);
  return { host, children, spawn };
}
/** Start a job and answer the load request. */
async function running(s: ReturnType<typeof setup>, onProgress = (_c: number, _o: number) => {}) {
  const result = s.host.generate(job, onProgress);
  await tick();
  const child = s.children.at(-1)!;
  child.say({ id: child.sent[0].id, type: 'loaded' });
  await tick();
  return { result, child };
}

test('starts the private Python with the helper script and loads the model once', async () => {
  const s = setup();
  const { result, child } = await running(s);
  expect(s.spawn).toHaveBeenCalledWith('/py', ['-u', '/engine.py'], expect.anything());
  expect(child.sent[0]).toMatchObject({ type: 'load', modelDir: '/m', whisperDir: '/w' });
  expect(child.sent[1]).toMatchObject({ type: 'generate', ...job });
  child.say({ id: child.sent[1].id, type: 'done', sampleRate: 48000, samples: 10 });
  expect(await result).toEqual({ sampleRate: 48000, samples: 10 });

  const text = s.host.transcribe('/s.f32');
  await tick();
  expect(s.spawn).toHaveBeenCalledTimes(1);
  expect(child.sent.filter((m) => m.type === 'load')).toHaveLength(1);
  child.say({ id: child.sent[2].id, type: 'transcript', text: 'Hello.' });
  expect(await text).toBe('Hello.');
});

test('progress reaches the caller, and output split across reads still parses', async () => {
  const s = setup();
  const seen: number[][] = [];
  const { result, child } = await running(s, (c, o) => seen.push([c, o]));
  const id = child.sent[1].id;
  const line = JSON.stringify({ id, type: 'progress', chunk: 1, of: 2 }) + '\n' + JSON.stringify({ id, type: 'done', sampleRate: 48000, samples: 5 }) + '\n';
  child.stdout.emit('data', Buffer.from(line.slice(0, 17)));
  child.stdout.emit('data', Buffer.from(line.slice(17)));
  expect(await result).toEqual({ sampleRate: 48000, samples: 5 });
  expect(seen).toEqual([[1, 2]]);
});

test('an engine error rejects with its message', async () => {
  const s = setup();
  const { result, child } = await running(s);
  child.say({ id: child.sent[1].id, type: 'error', message: 'No audio.' });
  await expect(result).rejects.toThrow('No audio.');
  expect(s.host.busy).toBe(false);
});

test('if the helper dies, work in flight fails clearly and the next request starts a new helper', async () => {
  const s = setup();
  const { result, child } = await running(s);
  child.emit('exit', 9);
  await expect(result).rejects.toThrow('The voice engine stopped unexpectedly. Try again.');
  const again = s.host.transcribe('/s.f32');
  await tick();
  expect(s.spawn).toHaveBeenCalledTimes(2);
  const next = s.children[1];
  next.say({ id: next.sent[0].id, type: 'loaded' });
  await tick();
  next.say({ id: next.sent[1].id, type: 'transcript', text: 'ok' });
  expect(await again).toBe('ok');
});

test('a helper that cannot be started fails clearly', async () => {
  const s = setup();
  const result = s.host.generate(job, () => {});
  await tick();
  s.children[0].emit('error', new Error('spawn ENOENT'));
  await expect(result).rejects.toThrow('The voice engine stopped unexpectedly. Try again.');
  expect(s.host.busy).toBe(false);
});

test('cancel while the model is loading rejects as cancelled and never sends the job', async () => {
  const s = setup();
  const result = s.host.generate(job, () => {});
  await tick();
  s.host.cancel();
  const child = s.children[0];
  child.say({ id: child.sent[0].id, type: 'loaded' });
  await expect(result).rejects.toBeInstanceOf(CancelledError);
  expect(child.sent.some((m) => m.type === 'generate')).toBe(false);
  expect(child.killed).toBe(false);
});

test('cancel mid-job stops the helper, rejects as cancelled, and reloads for next time', async () => {
  const s = setup();
  const { result, child } = await running(s);
  s.host.cancel();
  await expect(result).rejects.toBeInstanceOf(CancelledError);
  expect(child.killed).toBe(true);
  await tick();
  expect(s.spawn).toHaveBeenCalledTimes(2);
  expect(s.children[1].sent[0]).toMatchObject({ type: 'load' });
  expect(s.host.busy).toBe(false);
});

test('only one generation at a time', async () => {
  const s = setup();
  await running(s);
  await expect(s.host.generate(job, () => {})).rejects.toThrow('Another generation is already running.');
});
