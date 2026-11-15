/** One microphone level reading (0..1 peak) at a time in seconds since recording began. */
export interface Reading { t: number; level: number }

export type CoachKind = 'starting' | 'good' | 'quiet' | 'silent' | 'paused' | 'loud';
export interface Hint { kind: CoachKind; message: string }

const GRACE_SEC = 1.5;
const WINDOW_SEC = 2.5;
const LOUD_WINDOW_SEC = 1;
const SILENT = 0.02;
const QUIET = 0.15;
const LOUD = 0.98;

const MESSAGES: Record<CoachKind, string> = {
  starting: 'Start reading whenever you are ready.',
  good: 'Sounding good. Keep going.',
  quiet: 'Raise your voice, or move closer to the microphone.',
  silent: 'No sound is coming in. Check your microphone.',
  paused: 'Keep reading. Pauses are fine, but the sample needs more speech.',
  loud: 'Too loud. Lower your voice or move back a little.',
};

/** What to tell someone mid-recording, judged from the last few seconds of microphone level. */
export function coach(readings: Reading[], now: number): Hint {
  const hint = (kind: CoachKind): Hint => ({ kind, message: MESSAGES[kind] });
  if (now < GRACE_SEC) return hint('starting');
  let recent = 0, recentLoud = 0, ever = 0;
  for (const r of readings) {
    ever = Math.max(ever, r.level);
    if (r.t >= now - WINDOW_SEC) recent = Math.max(recent, r.level);
    if (r.t >= now - LOUD_WINDOW_SEC) recentLoud = Math.max(recentLoud, r.level);
  }
  if (recentLoud >= LOUD) return hint('loud');
  if (recent < SILENT) return hint(ever >= QUIET ? 'paused' : 'silent');
  if (recent < QUIET) return hint('quiet');
  return hint('good');
}
