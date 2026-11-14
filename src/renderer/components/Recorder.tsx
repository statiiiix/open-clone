import { useEffect, useRef, useState } from 'react';
import { MAX_SAMPLE_SEC, MIN_SAMPLE_SEC, type MicRecording } from '../audio';

/** Something natural to read, long enough to pass the minimum at a normal pace. */
export const READ_ALOUD =
  'Hi, this is my voice. I am recording this sample so Open Clone can learn how I sound. I usually speak at about this pace, ' +
  'sometimes a little faster when I am excited, and a little slower when I am explaining something carefully. ' +
  'The quick brown fox jumps over the lazy dog, and that is about everything I wanted to say today.';

const RED = '#e5484d';
const BAR = 3, GAP = 2;
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** The live recording view: a red waveform that scrolls as you speak, a timer, and the length target. */
export function Recorder({ recording, onStop }: { recording: MicRecording; onStop: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [elapsed, setElapsed] = useState(0);
  const stopRef = useRef(onStop);
  stopRef.current = onStop;

  useEffect(() => {
    const started = performance.now();
    const levels: number[] = [];
    let frame = 0, raf = 0, lastSec = -1, stopped = false;
    const draw = () => {
      const c = canvas.current;
      if (!c) return;
      const sec = (performance.now() - started) / 1000;
      if (Math.floor(sec * 4) !== lastSec) { lastSec = Math.floor(sec * 4); setElapsed(sec); }
      if (sec >= MAX_SAMPLE_SEC && !stopped) { stopped = true; stopRef.current(); return; }
      // one bar every third frame keeps the scroll readable
      const level = recording.level();
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

  const enough = elapsed >= MIN_SAMPLE_SEC;
  return (
    <div className="recorder">
      <div className="rec-head">
        <span className="rec-live"><span className="rec-dot" /> REC</span>
        <span className="rec-time">{clock(elapsed)} <span className="muted">/ {clock(MAX_SAMPLE_SEC)}</span></span>
      </div>
      <canvas ref={canvas} className="wave" aria-label="Live sound wave of your recording" />
      <div className="rec-track" aria-hidden>
        <div className="rec-fill" style={{ width: `${Math.min(100, (elapsed / MAX_SAMPLE_SEC) * 100)}%` }} />
        <div className="rec-min" style={{ left: `${(MIN_SAMPLE_SEC / MAX_SAMPLE_SEC) * 100}%` }} />
      </div>
      <p className="small muted">{enough ? 'Long enough. Keep going up to 30 seconds for the best result, or stop now.' : `Keep going: at least ${MIN_SAMPLE_SEC} seconds are needed.`}</p>
      <div className="script">
        <div className="label">Read this aloud, in your normal voice</div>
        <p>{READ_ALOUD}</p>
      </div>
      <button type="button" className="rec-stop" onClick={onStop}><span className="square" /> Stop recording</button>
    </div>
  );
}
