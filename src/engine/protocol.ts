import type { GenParams } from '../shared/types';

/** Messages from the main process to the engine process. */
export type EngineRequest =
  | { id: number; type: 'load'; modelDir: string; lmVariant: string }
  /** samplePath: raw little-endian float32, 24 kHz mono */
  | { id: number; type: 'generate'; chunks: string[]; samplePath: string; params: GenParams }
  | { id: number; type: 'cancel' };

/** Messages from the engine process back. `id` echoes the request. */
export type EngineEvent =
  | { id: number; type: 'loaded' }
  | { id: number; type: 'progress'; chunk: number; of: number }
  | { id: number; type: 'done'; samples: Float32Array }
  | { id: number; type: 'cancelled' }
  | { id: number; type: 'error'; message: string };
