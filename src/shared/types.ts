export type ExpressionId = 'neutral' | 'happy' | 'sad' | 'excited' | 'angry' | 'calm';

export interface Voice {
  id: string;
  name: string;
  createdAt: string;
  /** file names inside voices/<id>/; neutral is the main sample */
  samples: Partial<Record<ExpressionId, string>> & { neutral: string };
  /** the words spoken in each sample, keyed like samples; missing until transcribed */
  transcripts?: Partial<Record<ExpressionId, string>>;
  /** length of the main sample; absent on voices saved before samples had to be one minute */
  sampleSec?: number;
}

export interface HistoryItem {
  id: string;
  voiceId: string;
  voiceName: string;
  text: string;
  expression: ExpressionId;
  durationSec: number;
  file: string;
  createdAt: string;
}

/** Voice samples are stored at this rate. */
export const SAMPLE_RATE = 24000;
/** Generated speech comes out at this rate. */
export const OUTPUT_RATE = 48000;
export const MAX_CHUNK_CHARS = 250;
