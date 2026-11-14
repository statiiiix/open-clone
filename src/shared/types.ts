export type ExpressionId = 'neutral' | 'happy' | 'sad' | 'excited' | 'angry' | 'calm';

/** intensity 0.25..2.0 (model "exaggeration"), variation 0..1.2 (sampling temperature, 0 = always the likeliest) */
export interface GenParams {
  intensity: number;
  variation: number;
}

export interface Voice {
  id: string;
  name: string;
  createdAt: string;
  /** file names inside voices/<id>/; neutral is the main sample */
  samples: Partial<Record<ExpressionId, string>> & { neutral: string };
}

export interface HistoryItem {
  id: string;
  voiceId: string;
  voiceName: string;
  text: string;
  expression: ExpressionId;
  params: GenParams;
  durationSec: number;
  file: string;
  createdAt: string;
}

export const SAMPLE_RATE = 24000;
export const MAX_CHUNK_CHARS = 250;
