import { useCallback, useEffect, useRef, useState } from 'react';
import { CANCELLED } from '../shared/api';
import type { HistoryItem, Voice } from '../shared/types';
import { Composer } from './components/Composer';
import { ExpressionSamples } from './components/ExpressionSamples';
import { History } from './components/History';
import { ModelDownload } from './components/ModelDownload';
import { NewVoiceSheet } from './components/NewVoiceSheet';
import { VoiceList } from './components/VoiceList';
import { messageOf } from './errors';
import { initialComposer, type ComposerState } from './state';

const api = () => window.openclone;

export function App() {
  const [model, setModel] = useState<'checking' | 'missing' | 'ready'>('checking');
  const [voices, setVoices] = useState<Voice[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [composer, setComposer] = useState<ComposerState>(initialComposer);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'new' | null>(null);
  const [exprVoiceId, setExprVoiceId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Voice | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const player = useRef<{ audio: HTMLAudioElement; url: string } | null>(null);

  useEffect(() => {
    void api().model.status().then(setModel);
    void api().voices.list().then((v) => { setVoices(v); setSelectedId(v[0]?.id ?? null); });
    void api().history.list().then(setHistory);
    return api().generate.onProgress((chunk, of) => setComposer((s) => ({ ...s, progress: [chunk, of] })));
  }, []);

  const stop = useCallback(() => {
    if (player.current) {
      player.current.audio.pause();
      URL.revokeObjectURL(player.current.url);
      player.current = null;
    }
    setPlayingId(null);
  }, []);

  const play = useCallback(async (id: string) => {
    stop();
    try {
      const bytes = await api().history.audio(id);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'audio/wav' }));
      const audio = new Audio(url);
      player.current = { audio, url };
      audio.onended = stop;
      setPlayingId(id);
      await audio.play();
    } catch (err) {
      stop();
      setError(messageOf(err));
    }
  }, [stop]);

  const generate = async () => {
    if (!selectedId) return;
    setError(null);
    setComposer((s) => ({ ...s, busy: true, progress: null }));
    try {
      const item = await api().generate.start({ voiceId: selectedId, text: composer.text, expression: composer.expression, params: composer.params });
      setHistory((h) => [item, ...h]);
      void play(item.id);
    } catch (err) {
      const msg = messageOf(err);
      if (msg !== CANCELLED) setError(msg);
    } finally {
      setComposer((s) => ({ ...s, busy: false, progress: null }));
    }
  };

  const replaceVoice = (v: Voice) => setVoices((list) => list.map((x) => (x.id === v.id ? v : x)));
  const guard = (p: Promise<unknown>) => p.catch((err) => setError(messageOf(err)));

  const removeVoice = async (v: Voice) => {
    setConfirmDelete(null);
    await guard(api().voices.remove(v.id).then(() => {
      setVoices((list) => {
        const rest = list.filter((x) => x.id !== v.id);
        setSelectedId((cur) => (cur === v.id ? rest[0]?.id ?? null : cur));
        return rest;
      });
    }));
  };

  if (model === 'checking') return <div className="center-screen" />;
  if (model === 'missing') return <ModelDownload onReady={() => setModel('ready')} />;

  const voice = voices.find((v) => v.id === selectedId) ?? null;
  const exprVoice = voices.find((v) => v.id === exprVoiceId) ?? null;
  return (
    <div className="app">
      <VoiceList
        voices={voices} selectedId={selectedId} onSelect={setSelectedId} onNew={() => setSheet('new')}
        onRename={(id, name) => void guard(api().voices.rename(id, name).then(replaceVoice))}
        onDelete={setConfirmDelete} onExpressions={(v) => setExprVoiceId(v.id)}
      />
      <main>
        <Composer state={composer} voice={voice} error={error} onChange={setComposer} onGenerate={() => void generate()} onCancel={() => void api().generate.cancel()} />
        <History
          items={history} playingId={playingId}
          onToggle={(id) => (playingId === id ? stop() : void play(id))}
          onSave={(id) => void guard(api().history.saveAs(id))}
          onDelete={(id) => { if (playingId === id) stop(); void guard(api().history.remove(id).then(() => setHistory((h) => h.filter((x) => x.id !== id)))); }}
        />
      </main>
      {sheet === 'new' && (
        <NewVoiceSheet onClose={() => setSheet(null)} onCreated={(v) => { setVoices((list) => [...list, v]); setSelectedId(v.id); setSheet(null); }} />
      )}
      {exprVoice && <ExpressionSamples voice={exprVoice} onClose={() => setExprVoiceId(null)} onChanged={replaceVoice} />}
      {confirmDelete && (
        <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmDelete(null); }}>
          <div className="card narrow">
            <h2>Delete “{confirmDelete.name}”?</h2>
            <p className="muted">The voice and its samples are removed from this Mac. Audio you already generated stays in History.</p>
            <div className="row end">
              <button onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="primary" onClick={() => void removeVoice(confirmDelete)}>Delete voice</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
