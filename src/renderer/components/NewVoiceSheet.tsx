import { useState, type FormEvent } from 'react';
import type { Voice } from '../../shared/types';
import { messageOf } from '../errors';
import { SamplePicker } from './SamplePicker';

export const CONSENT_TEXT = 'This is my voice, or I have permission to clone it.';

export function NewVoiceSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (v: Voice) => void }) {
  const [name, setName] = useState('');
  const [audio, setAudio] = useState<Float32Array | null>(null);
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = name.trim().length > 0 && audio !== null && consent && !saving;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || !audio) return;
    setSaving(true);
    try {
      onCreated(await window.openclone.voices.create(name, audio));
    } catch (err) {
      setError(messageOf(err));
      setSaving(false);
    }
  };

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="card sheet" onSubmit={(e) => void save(e)}>
        <h2>New voice</h2>
        <label className="field">
          <span>Name</span>
          <input autoFocus value={name} maxLength={60} placeholder="My voice" onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="field">
          <span>Voice sample</span>
          <SamplePicker onChange={setAudio} />
        </div>
        <label className="check">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>{CONSENT_TEXT}</span>
        </label>
        {saving && <p className="muted small">Writing down the words in your sample so the clone can continue from them. The first time, this waits for the voice model to load.</p>}
        {error && <p className="error">{error}</p>}
        <div className="row end">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary" disabled={!ready}>{saving ? 'Transcribing your sample…' : 'Save voice'}</button>
        </div>
      </form>
    </div>
  );
}
