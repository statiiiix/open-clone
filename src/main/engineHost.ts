import { spawn, type ChildProcess } from 'node:child_process';
import type { EngineEvent, EngineRequest } from './engineProtocol';

export interface EnginePaths { python: string; script: string; modelDir: string; whisperDir: string }
export interface GenerateJob { chunks: string[]; referencePath: string; promptPath: string; promptText: string; outPath: string }

type Pending = { resolve: (e: EngineEvent) => void; reject: (err: Error) => void; onProgress?: (chunk: number, of: number) => void };
// Distributive, so each request variant keeps its own fields.
type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;
type Child = Pick<ChildProcess, 'stdin' | 'stdout' | 'stderr' | 'kill' | 'on'>;

const STOPPED = 'The voice engine stopped unexpectedly. Try again.';

export class CancelledError extends Error {
  constructor() { super('Generation cancelled.'); }
}

/** Owns the engine helper process: starts it on first use, restarts it if it dies. */
export class EngineHost {
  private child: Child | null = null;
  private ready: Promise<void> | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private activeJob: number | null = null;
  private cancelRequested = false;

  constructor(private paths: EnginePaths, private spawnImpl: typeof spawn = spawn) {}

  get busy(): boolean { return this.activeJob !== null; }

  private request(req: WithoutId<EngineRequest>, onProgress?: Pending['onProgress']): { id: number; result: Promise<EngineEvent> } {
    const id = this.nextId++;
    const result = new Promise<EngineEvent>((resolve, reject) => this.pending.set(id, { resolve, reject, onProgress }));
    this.child!.stdin!.write(JSON.stringify({ ...req, id }) + '\n');
    return { id, result };
  }

  private onEvent(e: EngineEvent): void {
    const p = this.pending.get(e.id);
    if (!p) return;
    if (e.type === 'progress') { p.onProgress?.(e.chunk, e.of); return; }
    this.pending.delete(e.id);
    if (e.type === 'error') p.reject(new Error(e.message));
    else p.resolve(e);
  }

  private start(): Promise<void> {
    if (this.ready) return this.ready;
    const child: Child = this.spawnImpl(this.paths.python, ['-u', this.paths.script], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.child = child;
    let buffer = '';
    child.stdout!.on('data', (data: Buffer) => {
      buffer += data.toString('utf8');
      for (let nl = buffer.indexOf('\n'); nl >= 0; nl = buffer.indexOf('\n')) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        try { this.onEvent(JSON.parse(line) as EngineEvent); } catch { /* not an event */ }
      }
    });
    child.stderr!.on('data', (data: Buffer) => { if (process.env.OPENCLONE_ENGINE_LOG) process.stderr.write(data); });
    const gone = () => {
      if (this.child !== child) return;
      const cancelled = this.cancelRequested ? this.activeJob : null;
      this.child = null;
      this.ready = null;
      for (const [id, p] of this.pending) p.reject(id === cancelled ? new CancelledError() : new Error(STOPPED));
      this.pending.clear();
    };
    child.on('exit', gone);
    child.on('error', gone);
    this.ready = this.request({ type: 'load', modelDir: this.paths.modelDir, whisperDir: this.paths.whisperDir }).result.then(
      () => undefined,
      (err) => { this.dispose(); throw err; },
    );
    this.ready.catch(() => {}); // callers handle it; an idle warm-up must not crash the app
    return this.ready;
  }

  /** The words spoken in a voice sample. */
  async transcribe(samplePath: string): Promise<string> {
    await this.start();
    const e = await this.request({ type: 'transcribe', samplePath }).result;
    if (e.type !== 'transcript') throw new Error('The voice engine gave an unexpected answer.');
    return e.text;
  }

  /** Speak the job's chunks; the audio lands in job.outPath as raw float32. */
  async generate(job: GenerateJob, onProgress: (chunk: number, of: number) => void): Promise<{ sampleRate: number; samples: number }> {
    if (this.busy) throw new Error('Another generation is already running.');
    this.activeJob = -1; // claimed while the model loads
    this.cancelRequested = false;
    try {
      await this.start();
      if (this.cancelRequested) throw new CancelledError();
      const { id, result } = this.request({ type: 'generate', ...job }, onProgress);
      this.activeJob = id;
      const e = await result;
      if (e.type !== 'done') throw new Error('The voice engine gave an unexpected answer.');
      return { sampleRate: e.sampleRate, samples: e.samples };
    } finally {
      this.activeJob = null;
      this.cancelRequested = false;
    }
  }

  /** Load the model ahead of the first request, so that request does not wait for it. */
  warm(): void {
    void this.start().catch(() => {});
  }

  /**
   * Stop the running generation. A sentence cannot be interrupted from inside the model,
   * so the helper is ended and a fresh one starts loading for next time.
   */
  cancel(): void {
    this.cancelRequested = true;
    if (!this.child || this.activeJob === null || this.activeJob < 0) return;
    const child = this.child;
    child.on('exit', () => this.warm());
    child.kill();
  }

  dispose(): void {
    const child = this.child;
    this.child = null;
    this.ready = null;
    child?.kill();
  }
}
