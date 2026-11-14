import { INTENSITY_RANGE, VARIATION_RANGE } from '../../shared/presets';
import type { Voice } from '../../shared/types';
import { canGenerate, selectExpression, type ComposerState } from '../state';
import { ExpressionPicker } from './ExpressionPicker';

interface Props {
  state: ComposerState;
  voice: Voice | null;
  error: string | null;
  onChange: (s: ComposerState) => void;
  onGenerate: () => void;
  onCancel: () => void;
}

const MAX_TEXT = 5000;

export function Composer({ state, voice, error, onChange, onGenerate, onCancel }: Props) {
  const slider = (label: string, hint: string, key: 'intensity' | 'variation', [min, max]: readonly [number, number]) => (
    <label className="slider">
      <span>{label}</span>
      <input
        type="range" min={min} max={max} step={0.05} value={state.params[key]} disabled={state.busy}
        onChange={(e) => onChange({ ...state, params: { ...state.params, [key]: Number(e.target.value) } })}
      />
      <output>{state.params[key].toFixed(2)}</output>
      <small className="muted">{hint}</small>
    </label>
  );

  return (
    <section className="composer">
      <div className="label">Text</div>
      <textarea
        value={state.text} maxLength={MAX_TEXT} disabled={state.busy}
        placeholder={voice ? `Type what you want ${voice.name} to say` : 'Add a voice first, then type what you want it to say'}
        onChange={(e) => onChange({ ...state, text: e.target.value })}
        onKeyDown={(e) => { if (e.key === 'Enter' && e.metaKey && canGenerate(state, voice?.id ?? null)) onGenerate(); }}
      />
      <div className="label">Expression</div>
      <ExpressionPicker value={state.expression} voice={voice} disabled={state.busy} onChange={(e) => onChange(selectExpression(state, e))} />
      <div className="sliders">
        {slider('Intensity', 'How strongly the expression comes through', 'intensity', INTENSITY_RANGE)}
        {slider('Variation', 'Lower is steadier, higher is livelier', 'variation', VARIATION_RANGE)}
      </div>
      <div className="row">
        {state.busy ? (
          <button className="primary" onClick={onCancel}>Cancel</button>
        ) : (
          <button className="primary" disabled={!canGenerate(state, voice?.id ?? null)} onClick={onGenerate}>Generate</button>
        )}
        {state.busy && (
          <span className="muted small">
            <span className="spinner" /> {state.progress ? `Generating part ${state.progress[0]} of ${state.progress[1]}…` : 'Loading the voice model…'}
          </span>
        )}
        {!state.busy && <span className="muted small">{state.text.length > MAX_TEXT * 0.9 ? `${state.text.length} / ${MAX_TEXT}` : '⌘ Return'}</span>}
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
