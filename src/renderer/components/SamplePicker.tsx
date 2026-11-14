import { useEffect, useRef, useState, type DragEvent } from 'react';
import { checkSample, decodeTo24kMono, recordMic, SAMPLE_MESSAGES } from '../audio';

/** Pick a voice sample by dropping a file, browsing, or recording. Reports a checked 24 kHz clip, or null. */
export function SamplePicker({ onChange }: { onChange: (audio: Float32Array | null) => void }) {
  const [status, setStatus] = useState<{ kind: 'idle' | 'ok' | 'error' | 'working'; text: string }>({ kind: 'idle', text: '' });
  const [recording, setRecording] = useState<{ stop(): Promise<Blob> } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!recording) return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 250);
    return () => clearInterval(timer);
  }, [recording]);
  // Never leave the microphone open if the sheet closes mid-recording.
  const live = useRef(recording);
  live.current = recording;
  useEffect(() => () => { void live.current?.stop(); }, []);

  const use = async (blob: Blob, label: string) => {
    onChange(null);
    setStatus({ kind: 'working', text: 'Reading audio…' });
    let audio: Float32Array;
    try {
      audio = await decodeTo24kMono(blob);
    } catch {
      setStatus({ kind: 'error', text: SAMPLE_MESSAGES.unreadable });
      return;
    }
    const check = checkSample(audio);
    if (!check.ok) { setStatus({ kind: 'error', text: SAMPLE_MESSAGES[check.reason] }); return; }
    const sec = Math.round(check.audio.length / 24000);
    const trimmed = check.audio.length < audio.length ? ' (trimmed to the first 30 seconds)' : '';
    setStatus({ kind: 'ok', text: `${label} · ${sec} seconds${trimmed}` });
    onChange(check.audio);
  };

  const toggleRecord = async () => {
    if (recording) {
      const rec = recording;
      setRecording(null);
      await use(await rec.stop(), 'Recording');
      return;
    }
    try {
      setElapsed(0);
      setRecording(await recordMic());
      onChange(null);
      setStatus({ kind: 'idle', text: '' });
    } catch {
      setStatus({ kind: 'error', text: SAMPLE_MESSAGES['mic-denied'] });
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void use(file, file.name);
  };

  return (
    <div>
      <div
        className={`drop ${over ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        {recording ? (
          <p className="rec"><span className="dot" /> Recording · {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</p>
        ) : (
          <p>Drop an audio file here (WAV, MP3, M4A)</p>
        )}
        <div className="row centered">
          <button type="button" onClick={() => input.current?.click()} disabled={!!recording}>Choose file</button>
          <button type="button" onClick={() => void toggleRecord()}>{recording ? 'Stop recording' : 'Record'}</button>
        </div>
        <input
          ref={input} type="file" accept="audio/*,.wav,.mp3,.m4a" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void use(f, f.name); e.target.value = ''; }}
        />
      </div>
      <p className="muted small">10 to 30 seconds of clear speech, one speaker, no music or background noise.</p>
      {status.text && <p className={status.kind === 'error' ? 'error' : 'small'}>{status.kind === 'ok' ? '✓ ' : ''}{status.text}</p>}
    </div>
  );
}
