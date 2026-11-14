import { PRESETS } from '../shared/presets';
import type { ExpressionId, GenParams } from '../shared/types';

export interface ComposerState {
  text: string;
  expression: ExpressionId;
  params: GenParams;
  busy: boolean;
  /** [part, of] while generating */
  progress: [number, number] | null;
}

const presetParams = (e: ExpressionId): GenParams => ({ intensity: PRESETS[e].intensity, variation: PRESETS[e].variation });

export function initialComposer(): ComposerState {
  return { text: '', expression: 'neutral', params: presetParams('neutral'), busy: false, progress: null };
}

export function canGenerate(s: ComposerState, voiceId: string | null): boolean {
  return !s.busy && voiceId !== null && s.text.trim().length > 0;
}

export function selectExpression(s: ComposerState, e: ExpressionId): ComposerState {
  return { ...s, expression: e, params: presetParams(e) };
}
