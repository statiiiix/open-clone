import { useState } from 'react';
import { PRESETS } from '../../shared/presets';
import type { ExpressionId, Voice } from '../../shared/types';
import { messageOf } from '../errors';
import { EXPRESSION_MIN_SEC } from '../audio';
import { SamplePicker } from './SamplePicker';

const IDS = (Object.keys(PRESETS) as ExpressionId[]).filter((e) => e !== 'neutral');

/** Optional: record yourself in each mood. The model imitates the delivery of the sample it is given. */
export function ExpressionSamples({ voice, onClose, onChanged }: { voice: Voice; onClose: () => void; onChanged: (v: Voice) => void }) {
  const [open, setOpen] = useState<ExpressionId | null>(null);
  const [pending, setPending] = useState<Float32Array | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = async (e: ExpressionId, audio: Float32Array | null) => {
    try {
      onChanged(await window.openclone.voices.setExpressionSample(voice.id, e, audio));
      setOpen(null);
      setPending(null);
      setError(null);
    } catch (err) {
      setError(messageOf(err));
    }
  };

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card sheet">
        <h2>Expressions for {voice.name}</h2>
        <p className="muted small">
          For a stronger effect, record yourself speaking in each mood. When an expression has its own sample, Open Clone uses it instead of the
          main sample.
        </p>
        <ul className="expr-list">
          {IDS.map((e) => (
            <li key={e}>
              <div className="row">
                <strong>{PRESETS[e].label}</strong>
                <span className="muted small grow">{voice.samples[e] ? 'Has its own sample' : 'Uses the main sample'}</span>
                {voice.samples[e] && <button onClick={() => void apply(e, null)}>Remove</button>}
                <button onClick={() => { setOpen(open === e ? null : e); setPending(null); }}>{open === e ? 'Close' : voice.samples[e] ? 'Replace' : 'Add sample'}</button>
              </div>
              {open === e && (
                <div className="expr-pick">
                  <SamplePicker onChange={setPending} minSec={EXPRESSION_MIN_SEC} />
                  <button className="primary" disabled={!pending} onClick={() => pending && void apply(e, pending)}>Use this sample</button>
                </div>
              )}
            </li>
          ))}
        </ul>
        {error && <p className="error">{error}</p>}
        <div className="row end"><button className="primary" onClick={onClose}>Done</button></div>
      </div>
    </div>
  );
}
