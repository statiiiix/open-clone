import type { ExpressionId } from './types';

/**
 * Each expression is a tone instruction placed in front of the sample's transcript.
 * The wording is what the owner's approved clips were generated with.
 */
export const PRESETS: Record<ExpressionId, { label: string; instruction: string | null }> = {
  neutral: { label: 'Neutral', instruction: null },
  happy: { label: 'Happy', instruction: 'happy, warm, smiling tone' },
  sad: { label: 'Sad', instruction: 'sad, slow, quiet tone' },
  excited: { label: 'Excited', instruction: 'excited, cheerful tone' },
  angry: { label: 'Angry', instruction: 'angry, forceful tone' },
  calm: { label: 'Calm', instruction: 'calm, soft, relaxed tone' },
};
