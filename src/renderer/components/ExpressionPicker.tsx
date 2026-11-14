import { PRESETS } from '../../shared/presets';
import type { ExpressionId, Voice } from '../../shared/types';

const IDS = Object.keys(PRESETS) as ExpressionId[];

/** Six pills. A dot marks expressions that have their own recorded sample for this voice. */
export function ExpressionPicker({ value, voice, onChange, disabled }: { value: ExpressionId; voice: Voice | null; onChange: (e: ExpressionId) => void; disabled?: boolean }) {
  return (
    <div className="pills" role="radiogroup" aria-label="Expression">
      {IDS.map((id) => (
        <button
          key={id} type="button" role="radio" aria-checked={value === id} disabled={disabled}
          className={`pill ${value === id ? 'on' : ''}`} onClick={() => onChange(id)}
          title={id !== 'neutral' && voice?.samples[id] ? 'Uses your own sample for this expression' : undefined}
        >
          {PRESETS[id].label}
          {id !== 'neutral' && voice?.samples[id] && <span className="own" aria-label="has its own sample" />}
        </button>
      ))}
    </div>
  );
}
