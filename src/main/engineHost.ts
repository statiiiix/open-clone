import { utilityProcess, type UtilityProcess } from 'electron';
import type { EngineEvent, EngineRequest } from '../engine/protocol';
import type { GenParams } from '../shared/types';

type Pending = { resolve: (e: EngineEvent) => void; reject: (err: Error) => void; onProgress?: (chunk: number, of: number) => void };
// Distributive, so each request variant keeps its own fields.
type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;

export class CancelledError extends Error {
  constructor() { super('Generation cancelled.'); }
}

/** Owns the engine process: starts it on first use, restarts it if it dies. */
export class EngineHost {
  private child: UtilityProcess | null = null;
  private ready: Promise<void> | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private activeJob: number | null = null;
  private cancelRequested = false;

  constructor(private workerPath: string, private modelDir: string, private lmVariant: string) {}

  get busy(): boolean { return this.activeJob !== null; }

  private request(req: WithoutId<EngineRequest>, onProgress?: Pending['onProgress']): { id: number; result: Promise<EngineEvent> } {
    const id = this.nextId++;
    const result = new Promise<EngineEvent>((resolve, reject) => this.pending.set(id, { resolve, reject, onProgress }));
    this.child!.postMessage({ ...req, id });
    return { id, result };
  }

  private start(): Promise<void> {
    if (this.ready) return this.ready;
    const child = utilityProcess.fork(this.workerPath, [], { serviceName: 'Open Clone voice engine' });
    this.child = child;
    child.on('message', (e: EngineEvent) => {
      const p = this.pending.get(e.id);
      if (!p) return;
      if (e.type === 'progress') { p.onProgress?.(e.chunk, e.of); return; }
      this.pending.delete(e.id);
      if (e.type === 'error') p.reject(new Error(e.message));
      else if (e.type === 'cancelled') p.reject(new CancelledError());
      else p.resolve(e);
    });
    child.on('exit', () => {
      if (this.child !== child) return;
      this.child = null;
      this.ready = null;
      this.activeJob = null;
      for (const p of this.pending.values()) p.reject(new Error('The voice engine stopped unexpectedly. Try again.'));
      this.pending.clear();
    });
    this.ready = this.request({ type: 'load', modelDir: this.modelDir, lmVariant: this.lmVariant }).result.then(
      () => undefined,
      (err) => { this.dispose(); throw err; },
    );
    return this.ready;
  }

  async generate(chunks: string[], samplePath: string, params: GenParams, onProgress: (chunk: number, of: number) => void): Promise<Float32Array> {
    if (this.busy) throw new Error('Another generation is already running.');
    this.activeJob = -1; // claimed while the model loads
    this.cancelRequested = false;
    try {
      await this.start();
      if (this.cancelRequested) throw new CancelledError();
      const { id, result } = this.request({ type: 'generate', chunks, samplePath, params }, onProgress);
      this.activeJob = id;
      const e = await result;
      if (e.type !== 'done') throw new Error('The voice engine gave an unexpected answer.');
      return e.samples;
    } finally {
      this.activeJob = null;
    }
  }

  cancel(): void {
    this.cancelRequested = true;
    if (this.child && this.activeJob !== null && this.activeJob > 0) this.child.postMessage({ id: this.activeJob, type: 'cancel' } satisfies EngineRequest);
  }

  dispose(): void {
    const child = this.child;
    this.child = null;
    this.ready = null;
    child?.kill();
  }
}
