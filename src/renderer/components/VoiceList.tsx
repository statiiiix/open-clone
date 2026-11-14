import { useState } from 'react';
import type { Voice } from '../../shared/types';

interface Props {
  voices: Voice[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (v: Voice) => void;
  onExpressions: (v: Voice) => void;
}

export function VoiceList({ voices, selectedId, onSelect, onNew, onRename, onDelete, onExpressions }: Props) {
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const commit = () => {
    if (editing && editing.name.trim()) onRename(editing.id, editing.name);
    setEditing(null);
  };

  return (
    <aside className="sidebar">
      <div className="brand">OPEN CLONE</div>
      <div className="label">Voices</div>
      <ul className="voices">
        {voices.map((v) => (
          <li key={v.id} className={v.id === selectedId ? 'selected' : ''}>
            {editing?.id === v.id ? (
              <input
                autoFocus value={editing.name} maxLength={60}
                onChange={(e) => setEditing({ id: v.id, name: e.target.value })}
                onBlur={commit}
                onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(null); }}
              />
            ) : (
              <button className="voice" onClick={() => onSelect(v.id)} title={v.name}>{v.name}</button>
            )}
            {v.id === selectedId && editing?.id !== v.id && (
              <div className="voice-actions">
                <button onClick={() => onExpressions(v)}>Expressions</button>
                <button onClick={() => setEditing({ id: v.id, name: v.name })}>Rename</button>
                <button onClick={() => onDelete(v)}>Delete</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {voices.length === 0 && <p className="muted small pad">No voices yet. Add yours to get started.</p>}
      <button className="new-voice" onClick={onNew}>+ New voice</button>
    </aside>
  );
}
