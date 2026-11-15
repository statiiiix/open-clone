import { useEffect, useState } from 'react';
import type { Voice } from '../../shared/types';
import { progressLine } from '../estimate';
import { canGenerate, selectExpression, type ComposerState } from '../state';
import { ExpressionPicker } from './ExpressionPicker';

interface Props {
  state: ComposerState;
  voice: Voice | null;
  /** this Mac takes minutes per sentence */
  slow: boolean;
  error: string | null;
  onChange: (s: ComposerState) => void;
  onGenerate: () => void;
  onCancel: () => void;
}

const MAX_TEXT = 5000;

export function Composer({ state, voice, slow, error, onChange, onGenerate, onCancel }: Props) {
  // Tick once a second while generating, so the elapsed time and estimate stay current.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!state.busy) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [state.busy]);

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
      <div className="row">
        {state.busy ? (
          <button className="primary" onClick={onCancel}>Cancel</button>
        ) : (
          <button className="primary" disabled={!canGenerate(state, voice?.id ?? null)} onClick={onGenerate}>Generate</button>
        )}
        {state.busy && (
          <span className="muted small">
            <span className="spinner" /> {progressLine(state.progress, state.speakingSince ? (now - state.speakingSince) / 1000 : 0)}
          </span>
        )}
        {!state.busy && <span className="muted small">{state.text.length > MAX_TEXT * 0.9 ? `${state.text.length} / ${MAX_TEXT}` : '⌘ Return'}</span>}
      </div>
      {slow && !state.busy && <p className="muted small">On this Mac a sentence takes a few minutes.</p>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
