import { PRESETS } from '../../shared/presets';
import type { HistoryItem } from '../../shared/types';

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

interface Props {
  items: HistoryItem[];
  playingId: string | null;
  onToggle: (id: string) => void;
  onSave: (id: string) => void;
  onDelete: (id: string) => void;
}

export function History({ items, playingId, onToggle, onSave, onDelete }: Props) {
  return (
    <section className="history">
      <div className="label">History</div>
      {items.length === 0 && <p className="muted small">Everything you generate appears here.</p>}
      <ul>
        {items.map((h) => (
          <li key={h.id}>
            <button className="play" aria-label={playingId === h.id ? 'Pause' : 'Play'} onClick={() => onToggle(h.id)}>
              {playingId === h.id ? '❚❚' : '▶'}
            </button>
            <span className="text" title={h.text}>{h.text}</span>
            <span className="muted small meta">{h.voiceName} · {PRESETS[h.expression]?.label ?? h.expression} · {clock(h.durationSec)}</span>
            <button onClick={() => onSave(h.id)}>Save</button>
            <button onClick={() => onDelete(h.id)} aria-label="Delete">✕</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
