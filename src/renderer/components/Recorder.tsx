import { useEffect, useRef, useState } from 'react';
import { MAX_SAMPLE_SEC, type MicRecording } from '../audio';
import { coach, type Hint, type Reading } from '../coach';

/** Something natural to read: enough for the full minute even for a fast reader. */
export const READ_ALOUD = [
  'Hi, this is my voice. I am recording this sample so Open Clone can learn how I sound when I talk normally.',
  'I usually speak at about this pace, sometimes a little faster when I am excited, and a little slower when I am explaining something carefully.',
  'Have you ever noticed how different a voice sounds on a recording? Mine always surprises me!',
  'Yesterday I walked to the shop, bought fresh bread, juice and a few oranges, then called an old friend on the way home.',
  'We talked about work, the weather, and a trip we keep promising to take. Maybe this year we will finally book it.',
  'The quick brown fox jumps over the lazy dog, while seven zebras gaze quietly at the view.',
  'Numbers are useful too: one, two, three, fourteen, twenty-five, sixty, a hundred and ninety, and two thousand.',
  'When I explain something important, I slow down, choose each word, and leave a short pause before the main point.',
  'When I am in a hurry, the words come out quickly, and I barely stop to breathe between one thought and the next.',
  'Some days are calm and ordinary. Others are loud, busy and full of surprises, and honestly I enjoy both kinds.',
  'A good cup of coffee in the morning, a little music, and a clear plan for the day usually put me in a great mood.',
  'If there is still time left, I will simply keep talking about my day until the recording stops by itself.',
];

const RED = '#e5484d';
const BAR = 3, GAP = 2;
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** The live recording view: a red waveform that scrolls as you speak, a timer, and the length target. */
export function Recorder({ recording, minSec, onStop }: { recording: MicRecording; minSec: number; onStop: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [elapsed, setElapsed] = useState(0);
  const [hint, setHint] = useState<Hint>(() => coach([], 0));
  const stopRef = useRef(onStop);
  stopRef.current = onStop;

  useEffect(() => {
    const started = performance.now();
    const levels: number[] = [];
    const readings: Reading[] = [];
    let hintKind = 'starting';
    let frame = 0, raf = 0, lastSec = -1, stopped = false;
    const draw = () => {
      const c = canvas.current;
      if (!c) return;
      const sec = (performance.now() - started) / 1000;
      if (Math.floor(sec * 4) !== lastSec) { lastSec = Math.floor(sec * 4); setElapsed(sec); }
      // Run a moment past the limit: the saved clip is trimmed to it, and must not fall just short of it.
      if (sec >= MAX_SAMPLE_SEC + 1 && !stopped) { stopped = true; stopRef.current(); return; }
      // one bar every third frame keeps the scroll readable
      const level = recording.level();
      readings.push({ t: sec, level });
      // Old readings are folded into one, so the coach still knows whether anything was ever heard.
      while (readings.length > 2 && readings[1].t < sec - 3) {
        const old = readings.shift()!;
        readings[0].level = Math.max(readings[0].level, old.level);
      }
      const next = coach(readings, sec);
      if (next.kind !== hintKind) { hintKind = next.kind; setHint(next); }
      if (frame++ % 3 === 0) levels.push(level); else levels[levels.length - 1] = Math.max(levels[levels.length - 1] ?? 0, level);
      const dpr = window.devicePixelRatio || 1;
      const w = c.clientWidth, h = c.clientHeight;
      if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr; }
      const g = c.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const max = Math.floor(w / (BAR + GAP));
      const shown = levels.slice(-max);
      g.fillStyle = RED;
      shown.forEach((v, i) => {
        const bh = Math.max(2, Math.min(1, v * 1.6) * (h - 4));
        g.beginPath();
        g.roundRect(i * (BAR + GAP), (h - bh) / 2, BAR, bh, BAR / 2);
        g.fill();
      });
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [recording]);

  const enough = elapsed >= minSec;
  const shown = Math.min(elapsed, MAX_SAMPLE_SEC);
  return (
    <div className="recorder">
      <div className="rec-head">
        <span className="rec-live"><span className="rec-dot" /> REC</span>
        <span className="rec-time">{clock(shown)} <span className="muted">/ {clock(MAX_SAMPLE_SEC)}</span></span>
      </div>
      <canvas ref={canvas} className="wave" aria-label="Live sound wave of your recording" />
      <div className="rec-track" aria-hidden>
        <div className="rec-fill" style={{ width: `${(shown / MAX_SAMPLE_SEC) * 100}%` }} />
        {minSec < MAX_SAMPLE_SEC && <div className="rec-min" style={{ left: `${(minSec / MAX_SAMPLE_SEC) * 100}%` }} />}
      </div>
      <p className={`rec-coach ${hint.kind}`} role="status" aria-live="polite">{hint.message}</p>
      <p className="small muted">{minSec >= MAX_SAMPLE_SEC
        ? (enough ? 'That is the full minute. Finishing up.' : 'Keep reading until the minute is up. The recording stops by itself.')
        : (enough ? 'Long enough. Stop now, or keep going for a better result.' : `Keep going: at least ${minSec} seconds are needed.`)}</p>
      <div className="script">
        <div className="label">Read this aloud, in your normal voice</div>
        {READ_ALOUD.map((line) => <p key={line}>{line}</p>)}
      </div>
      <button type="button" className="rec-stop" onClick={onStop}><span className="square" /> Stop recording</button>
    </div>
  );
}
