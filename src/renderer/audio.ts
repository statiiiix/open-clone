import { SAMPLE_RATE } from '../shared/types';

/** Below this the clone is unreliable; above 30 s the model gains nothing. */
export const MIN_SAMPLE_SEC = 10;
export const MAX_SAMPLE_SEC = 30;
const SILENCE_RMS = 0.005;
const QUIET_RMS = 0.03;

export type SampleWarning = 'quiet' | 'clipped';
export type SampleCheck =
  | { ok: true; audio: Float32Array; warnings: SampleWarning[] }
  | { ok: false; reason: 'too-short' | 'silent' };

/** Is this clip usable as a voice sample? Long clips are trimmed to the first 30 seconds. */
export function checkSample(audio: Float32Array): SampleCheck {
  if (audio.length < MIN_SAMPLE_SEC * SAMPLE_RATE) return { ok: false, reason: 'too-short' };
  const trimmed = audio.length > MAX_SAMPLE_SEC * SAMPLE_RATE ? audio.slice(0, MAX_SAMPLE_SEC * SAMPLE_RATE) : audio;
  let sum = 0, loud = 0;
  for (let i = 0; i < trimmed.length; i++) {
    sum += trimmed[i] * trimmed[i];
    if (Math.abs(trimmed[i]) >= 0.99) loud++;
  }
  const rms = Math.sqrt(sum / trimmed.length);
  if (!(rms >= SILENCE_RMS)) return { ok: false, reason: 'silent' };
  const warnings: SampleWarning[] = [];
  if (rms < QUIET_RMS) warnings.push('quiet');
  if (loud / trimmed.length > 0.001) warnings.push('clipped');
  return { ok: true, audio: trimmed, warnings };
}

export const SAMPLE_MESSAGES = {
  'too-short': 'That sample is under 10 seconds. Use 10 to 30 seconds of clear speech.',
  silent: 'That sample is silent. Check the file or your microphone.',
  unreadable: 'That file could not be read as audio.',
  'mic-denied': 'Microphone access is off. Allow it in System Settings, or upload a file instead.',
  quiet: 'This sample is quiet. The clone will be more accurate if you speak closer to the microphone.',
  clipped: 'This sample is distorted from being too loud. Move back a little and record again for a cleaner clone.',
} as const;

/** Decode any audio the browser understands (WAV, MP3, M4A) to 24 kHz mono. */
export async function decodeTo24kMono(file: Blob): Promise<Float32Array> {
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
    const frames = Math.max(1, Math.ceil(decoded.duration * SAMPLE_RATE));
    const offline = new OfflineAudioContext(1, frames, SAMPLE_RATE);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start();
    return (await offline.startRendering()).getChannelData(0).slice();
  } finally {
    void ctx.close();
  }
}

export interface MicRecording {
  /** Current loudness, 0..1. Call once per animation frame while recording. */
  level(): number;
  stop(): Promise<Blob>;
}

/** Start recording from the microphone. Rejects if access is denied. */
export async function recordMic(): Promise<MicRecording> {
  // Processing is off on purpose: noise suppression and auto-gain change how a voice sounds.
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => chunks.push(e.data);
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  recorder.start();
  const finish = () => {
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close();
    return new Blob(chunks, { type: recorder.mimeType });
  };
  return {
    level() {
      analyser.getFloatTimeDomainData(buf);
      let peak = 0;
      for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
      return Math.min(1, peak);
    },
    stop: () =>
      new Promise((resolve) => {
        if (recorder.state === 'inactive') { resolve(finish()); return; }
        recorder.onstop = () => resolve(finish());
        recorder.stop();
      }),
  };
}

/** Play a 24 kHz clip. Returns a function that stops it. */
export function playSamples(audio: Float32Array, onEnd: () => void): () => void {
  const ctx = new AudioContext();
  const buffer = ctx.createBuffer(1, audio.length, SAMPLE_RATE);
  buffer.getChannelData(0).set(audio);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination);
  let done = false;
  const end = () => { if (!done) { done = true; void ctx.close(); onEnd(); } };
  src.onended = end;
  src.start();
  return () => { try { src.stop(); } catch { /* already stopped */ } end(); };
}
