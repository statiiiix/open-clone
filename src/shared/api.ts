import type { ExpressionId, HistoryItem, Voice } from './types';

export interface GenerateRequest {
  voiceId: string;
  text: string;
  expression: ExpressionId;
}

type Unsubscribe = () => void;

/** Everything the window can ask the app to do. Exposed as `window.openclone`. */
export interface OpenCloneApi {
  system: {
    /** True on Macs where a sentence takes minutes (Intel). */
    slowEngine(): Promise<boolean>;
  };
  model: {
    status(): Promise<'ready' | 'missing'>;
    /** total download size in bytes */
    size(): Promise<number>;
    download(): Promise<void>;
    onProgress(cb: (done: number, total: number) => void): Unsubscribe;
  };
  voices: {
    list(): Promise<Voice[]>;
    /** Saves the sample and writes down its words; this can take a while. */
    create(name: string, audio24k: Float32Array): Promise<Voice>;
    setExpressionSample(id: string, e: ExpressionId, audio24k: Float32Array | null): Promise<Voice>;
    rename(id: string, name: string): Promise<Voice>;
    remove(id: string): Promise<void>;
  };
  generate: {
    /** Rejects with a message starting "cancelled" if the user cancelled. */
    start(req: GenerateRequest): Promise<HistoryItem>;
    cancel(): Promise<void>;
    onProgress(cb: (chunk: number, of: number) => void): Unsubscribe;
  };
  history: {
    list(): Promise<HistoryItem[]>;
    remove(id: string): Promise<void>;
    /** WAV bytes */
    audio(id: string): Promise<Uint8Array>;
    /** Opens a save dialog. Resolves false if the user closed it. */
    saveAs(id: string): Promise<boolean>;
  };
}

export const CANCELLED = 'cancelled';
