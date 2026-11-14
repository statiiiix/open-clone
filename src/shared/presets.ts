import type { ExpressionId, GenParams } from './types';

export const INTENSITY_RANGE = [0.25, 2.0] as const;
export const VARIATION_RANGE = [0, 1.2] as const;

export const PRESETS: Record<ExpressionId, { label: string } & GenParams> = {
  neutral: { label: 'Neutral', intensity: 0.5, variation: 0.6 },
  happy: { label: 'Happy', intensity: 0.8, variation: 0.8 },
  sad: { label: 'Sad', intensity: 0.35, variation: 0.5 },
  excited: { label: 'Excited', intensity: 1.2, variation: 0.9 },
  angry: { label: 'Angry', intensity: 1.0, variation: 0.7 },
  calm: { label: 'Calm', intensity: 0.3, variation: 0.4 },
};

const clamp = (v: number, [lo, hi]: readonly [number, number], fallback: number) =>
  Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

export function clampParams(p: GenParams): GenParams {
  return {
    intensity: clamp(p.intensity, INTENSITY_RANGE, PRESETS.neutral.intensity),
    variation: clamp(p.variation, VARIATION_RANGE, PRESETS.neutral.variation),
  };
}
