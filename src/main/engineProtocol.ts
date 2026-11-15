/** One line of JSON each way between the app and the voice engine helper (python/engine.py). */
export type EngineRequest =
  | { id: number; type: 'load'; modelDir: string; whisperDir: string }
  /** samplePath: raw little-endian float32, 24 kHz mono */
  | { id: number; type: 'transcribe'; samplePath: string }
  | { id: number; type: 'generate'; chunks: string[]; referencePath: string; promptPath: string; promptText: string; outPath: string };

/** `id` echoes the request. */
export type EngineEvent =
  | { id: number; type: 'loaded' }
  | { id: number; type: 'transcript'; text: string }
  | { id: number; type: 'progress'; chunk: number; of: number }
  /** the audio is in the request's outPath: raw float32 mono at sampleRate */
  | { id: number; type: 'done'; sampleRate: number; samples: number }
  | { id: number; type: 'error'; message: string };
