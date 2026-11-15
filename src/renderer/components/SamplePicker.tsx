import { useEffect, useRef, useState, type DragEvent } from 'react';
import { checkSample, decodeTo24kMono, MIN_SAMPLE_SEC, playSamples, recordMic, SAMPLE_MESSAGES, tooShortMessage, type MicRecording, type SampleWarning } from '../audio';
import { Recorder } from './Recorder';

type Status = { kind: 'idle' | 'ok' | 'error' | 'working'; text: string; warnings?: SampleWarning[] };

/** Pick a voice sample by dropping a file, browsing, or recording. Reports a checked 24 kHz clip, or null. */
export function SamplePicker({ onChange, minSec = MIN_SAMPLE_SEC }: { onChange: (audio: Float32Array | null) => void; minSec?: number }) {
  const [status, setStatus] = useState<Status>({ kind: 'idle', text: '' });
  const [recording, setRecording] = useState<MicRecording | null>(null);
  const [clip, setClip] = useState<Float32Array | null>(null);
  const [stopPlayback, setStopPlayback] = useState<(() => void) | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // Never leave the microphone or the speaker running if the sheet closes.
  const live = useRef({ recording, stopPlayback });
  live.current = { recording, stopPlayback };
  useEffect(() => () => { void live.current.recording?.stop(); live.current.stopPlayback?.(); }, []);

  const set = (audio: Float32Array | null) => { stopPlayback?.(); setClip(audio); onChange(audio); };

  const use = async (blob: Blob, label: string) => {
    set(null);
    setStatus({ kind: 'working', text: 'Reading audio…' });
    let audio: Float32Array;
    try {
      audio = await decodeTo24kMono(blob);
    } catch {
      setStatus({ kind: 'error', text: SAMPLE_MESSAGES.unreadable });
      return;
    }
    const check = checkSample(audio, minSec);
    if (!check.ok) { setStatus({ kind: 'error', text: check.reason === 'too-short' ? tooShortMessage(minSec) : SAMPLE_MESSAGES[check.reason] }); return; }
    const sec = Math.round(check.audio.length / 24000);
    const trimmed = check.audio.length < audio.length ? ' (trimmed to the first minute)' : '';
    setStatus({ kind: 'ok', text: `${label} · ${sec} seconds${trimmed}`, warnings: check.warnings });
    set(check.audio);
  };

  const startRecording = async () => {
    set(null);
    setStatus({ kind: 'idle', text: '' });
    try {
      setRecording(await recordMic());
    } catch {
      setStatus({ kind: 'error', text: SAMPLE_MESSAGES['mic-denied'] });
    }
  };
  const stopRecording = async () => {
    const rec = recording;
    if (!rec) return;
    setRecording(null);
    await use(await rec.stop(), 'Recording');
  };

  const togglePlay = () => {
    if (stopPlayback) { stopPlayback(); return; }
    if (clip) setStopPlayback(() => playSamples(clip, () => setStopPlayback(null)));
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void use(file, file.name);
  };

  if (recording) return <Recorder recording={recording} minSec={minSec} onStop={() => void stopRecording()} />;

  return (
    <div>
      <div
        className={`drop ${over ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <button type="button" className="rec-start" onClick={() => void startRecording()}><span className="rec-dot still" /> Record my voice</button>
        <p className="muted small or">or drop an audio file here (WAV, MP3, M4A)</p>
        <button type="button" onClick={() => input.current?.click()}>Choose file</button>
        <input
          ref={input} type="file" accept="audio/*,.wav,.mp3,.m4a" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void use(f, f.name); e.target.value = ''; }}
        />
      </div>
      <p className="muted small">{minSec >= 60 ? 'One full minute of clear speech.' : `At least ${minSec} seconds of clear speech.`} One speaker, a quiet room, no music.</p>
      {status.text && (
        <p className={status.kind === 'error' ? 'error' : 'small sample-ok'}>
          {status.kind === 'ok' ? '✓ ' : ''}{status.text}
          {status.kind === 'ok' && clip && <button type="button" className="link" onClick={togglePlay}>{stopPlayback ? 'Stop' : 'Listen'}</button>}
        </p>
      )}
      {status.warnings?.map((w) => <p key={w} className="small warn">{SAMPLE_MESSAGES[w]}</p>)}
    </div>
  );
}
