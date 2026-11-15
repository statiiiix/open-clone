import { PRESETS } from './presets';
import type { ExpressionId, Voice } from './types';

export interface Recipe {
  /** The sample that says what the voice sounds like. */
  referencePath: string;
  /** The sample the model continues from; its delivery carries into the new speech. */
  promptPath: string;
  /** The words spoken in the prompt sample, with any tone instruction in front. */
  promptText: string;
}

/**
 * How a voice and an expression become the model's inputs.
 *
 * The model continues the prompt sample, so it needs that sample's exact words. A tone
 * instruction only works at the very start of those words. An expression with a sample of
 * its own needs no instruction: the sample's delivery is the tone.
 */
export function buildRecipe(voice: Voice, e: ExpressionId, samplePath: (file: string) => string): Recipe {
  const own = e !== 'neutral' && voice.samples[e] ? e : 'neutral';
  const transcript = voice.transcripts?.[own]?.trim();
  if (!transcript) throw new Error('This voice has not been transcribed yet.');
  const instruction = own === 'neutral' ? PRESETS[e].instruction : null;
  return {
    referencePath: samplePath(voice.samples.neutral),
    promptPath: samplePath(voice.samples[own]!),
    promptText: (instruction ? `(${instruction})` : '') + transcript,
  };
}
