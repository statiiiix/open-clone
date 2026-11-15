import type { ExpressionId } from '../shared/types';

export interface ComposerState {
  text: string;
  expression: ExpressionId;
  busy: boolean;
  /** [sentence being spoken, of] while generating */
  progress: [number, number] | null;
  /** when the first sentence started (ms), for the time estimate */
  speakingSince: number | null;
}

export function initialComposer(): ComposerState {
  return { text: '', expression: 'neutral', busy: false, progress: null, speakingSince: null };
}

export function canGenerate(s: ComposerState, voiceId: string | null): boolean {
  return !s.busy && voiceId !== null && s.text.trim().length > 0;
}

export function selectExpression(s: ComposerState, e: ExpressionId): ComposerState {
  return { ...s, expression: e };
}

/** A progress report from the engine: remember when speaking began. */
export function withProgress(s: ComposerState, chunk: number, of: number, now: number): ComposerState {
  return { ...s, progress: [chunk, of], speakingSince: s.speakingSince ?? now };
}
