import { SAMPLE_RATE } from '../shared/types';

export const MIN_SAMPLE_SEC = 3;
export const MAX_SAMPLE_SEC = 30;
const SILENCE_RMS = 0.005;

export type SampleCheck = { ok: true; audio: Float32Array } | { ok: false; reason: 'too-short' | 'silent' };

/** Is this clip usable as a voice sample? Long clips are trimmed to the first 30 seconds. */
export function checkSample(audio: Float32Array): SampleCheck {
  if (audio.length < MIN_SAMPLE_SEC * SAMPLE_RATE) return { ok: false, reason: 'too-short' };
  const trimmed = audio.length > MAX_SAMPLE_SEC * SAMPLE_RATE ? audio.slice(0, MAX_SAMPLE_SEC * SAMPLE_RATE) : audio;
  let sum = 0;
  for (let i = 0; i < trimmed.length; i++) sum += trimmed[i] * trimmed[i];
  const rms = Math.sqrt(sum / trimmed.length);
  if (!(rms >= SILENCE_RMS)) return { ok: false, reason: 'silent' };
  return { ok: true, audio: trimmed };
}

export const SAMPLE_MESSAGES = {
  'too-short': 'That sample is under 3 seconds. Use 10 to 30 seconds of clear speech.',
  silent: 'That sample is silent. Check the file or your microphone.',
  unreadable: 'That file could not be read as audio.',
  'mic-denied': 'Microphone access is off. Allow it in System Settings, or upload a file instead.',
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

/** Start recording from the microphone. Rejects if access is denied. */
export async function recordMic(): Promise<{ stop(): Promise<Blob> }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => chunks.push(e.data);
  recorder.start();
  return {
    stop: () =>
      new Promise((resolve) => {
        if (recorder.state === 'inactive') { resolve(new Blob(chunks, { type: recorder.mimeType })); return; }
        recorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          resolve(new Blob(chunks, { type: recorder.mimeType }));
        };
        recorder.stop();
      }),
  };
}
