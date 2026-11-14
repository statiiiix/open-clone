# Open Clone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local Mac app that clones a voice from one sample and speaks typed text in it with selectable expressions, shipped as Intel and Apple Silicon `.dmg` files.

**Architecture:** Electron app. The React renderer is the UI; the main process owns storage, the model download and a utility process that runs the Chatterbox ONNX graphs through `onnxruntime-node`. The renderer reaches everything through one preload API, and the main process reaches the engine through one message protocol, so the engine can be swapped later.

**Tech Stack:** Electron 45, electron-vite, TypeScript, React, `onnxruntime-node` 1.31, `@huggingface/transformers` 4 (tokenizer only), Vitest, electron-builder 26.

**Spec:** `docs/superpowers/specs/2026-11-14-open-clone-design.md`

## Global Constraints

- Minimum macOS 12. Targets `x64` and `arm64`, one codebase.
- No Python, Homebrew, ffmpeg or terminal needed at runtime.
- The only network call is the model download from `huggingface.co/onnx-community/chatterbox-ONNX`. No telemetry.
- All user data under `app.getPath('userData')` (`~/Library/Application Support/Open Clone/`) in `models/`, `voices/`, `history/`.
- UI colours: `#ffffff` background, `#000000` text and controls, `#8a8a8a` secondary text, `#e5e5e5` borders. No other colours.
- English only. WAV export only (24 000 Hz, mono, 16-bit PCM).
- App licence MIT. Every dependency must allow commercial sale.
- Commits use the owner's git identity only. No co-author trailers.

## Facts about the model (verified from the model card, 2026-11-14)

- Licence MIT. Four graphs in `onnx/`: `speech_encoder` (591 MB), `embed_tokens` (62 MB), `language_model` (fp32 2.08 GB, `_fp16` 1.04 GB, `_q4` 354 MB, `_q4f16` 305 MB), `conditional_decoder` (534 MB). Each has a `.onnx` and a `.onnx_data` file. Root holds `tokenizer.json`.
- Sample rate 24 000 Hz in and out. `START_SPEECH_TOKEN = 6561`, `STOP_SPEECH_TOKEN = 6562`. 30 layers, 16 KV heads, head dim 64. Repetition penalty 1.2.
- `speech_encoder`: input `audio_values` float32 `[1, N]`; outputs in order `cond_emb, prompt_token, ref_x_vector, prompt_feat`.
- `embed_tokens`: inputs `input_ids` int64, `position_ids` int64, `exaggeration` float32 `[1]`; output 0 is `inputs_embeds`.
- `language_model`: inputs `inputs_embeds`, `attention_mask` int64, `past_key_values.{0..29}.{key|value}` (initially `[1,16,0,64]` float32); outputs `logits` then present key/values in the same order.
- `conditional_decoder`: inputs `speech_tokens`, `speaker_embeddings` (= `ref_x_vector`), `speaker_features` (= `prompt_feat`); output 0 is the waveform.
- `position_ids`: first pass is `index - 1` for text tokens and `0` for ids `>= 6561`; each later step is `[[i + 1]]`.
- Loop: first step prepends `cond_emb` to `inputs_embeds`. Final speech tokens are the generated tokens without the start and stop token, with `prompt_token` prepended.
- The reference code decodes greedily. It exposes `exaggeration` only. There is no pace (CFG) input.

## Changes from the spec

- **Pace slider removed from v1.** The export has no pace control and it cannot be recreated in sampling code. Controls are Intensity (`exaggeration`) and Variation (sampling temperature, implemented in our loop). The spec's screen sketch and Expressions section are updated in Task 1.
- **Download size.** With the `_q4` language model the first-launch download is about 1.5 GB. Task 1 decides between `_q4` and `_fp16` (2.2 GB) by speed and by ear.

## Review Focus

1. Empty or whitespace-only text: Generate is disabled and nothing is sent to the engine. (Task 2, Task 6)
2. A long run with no sentence punctuation (over 250 characters): split on commas, then spaces, never mid-word, never dropped. (Task 2)
3. Reference sample shorter than 3 s, silent, or longer than 30 s: rejected with a clear message when short or silent; trimmed to the first 30 s when long. (Task 5)
4. First launch offline or download interrupted: clear error with Retry; partial files are never treated as complete; a relaunch resumes. (Task 4)
5. The model never emits the stop token: generation ends at the token cap and returns what it has, never hangs. (Task 3)

## File structure

```
package.json  tsconfig.json  electron.vite.config.ts  electron-builder.yml  LICENSE  README.md
scripts/engine-proof.ts        one-off timing and listening script (Task 1)
src/shared/types.ts            types shared by all processes
src/shared/presets.ts          expression presets
src/shared/splitText.ts        text into chunks
src/shared/wav.ts              Float32 samples to WAV bytes
src/engine/sampling.ts         repetition penalty and temperature sampling
src/engine/chatterbox.ts       the four ONNX sessions and the generation loop
src/engine/worker.ts           utility process entry, message protocol
src/main/index.ts              window and IPC wiring
src/main/store.ts              voices and history on disk
src/main/modelDownload.ts      model file list, download, verify
src/main/engineHost.ts         spawns the worker, promise API over messages
src/preload/index.ts           window.openclone
src/renderer/                  App.tsx, components/, audio.ts, styles.css
tests/                         mirrors src/
```

---

### Task 1: Project scaffold and engine proof (go/no-go gate)

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `LICENSE` (MIT), `scripts/engine-proof.ts`
- Modify: `docs/superpowers/specs/2026-11-14-open-clone-design.md` (Pace removal, measured numbers)

- [ ] **Step 1:** `git init`. Create `package.json` (name `open-clone`, `"type": "module"`), install `onnxruntime-node@1.31`, `@huggingface/transformers@4`, dev `typescript`, `tsx`, `vitest`. `.gitignore`: `node_modules`, `out`, `dist`, `proof/`.
- [ ] **Step 2:** Confirm the Intel binary exists: `ls node_modules/onnxruntime-node/bin/napi-v*/darwin/x64`. Expected: a `.node` file and a `libonnxruntime` dylib. If absent, pin the newest `onnxruntime-node` release that has it and record the version in Global Constraints.
- [ ] **Step 3:** Write `scripts/engine-proof.ts`. It downloads the model files and `default_voice.wav` into `proof/model/` (skip files already present), ports the reference loop from the Facts section using greedy decoding, and for each of `language_model_q4` and `language_model_fp16` generates the sentence `"I can't believe we finally made it, this is the best day of my life."` at exaggeration `0.3`, `0.5`, `0.8`, `1.2`. It writes `proof/<variant>-<exaggeration>.wav` and prints per clip: load time, generation seconds, audio seconds, and the ratio.
- [ ] **Step 4:** Run `npx tsx scripts/engine-proof.ts`. Expected: eight WAV files and a timing table, no errors.
- [ ] **Step 5:** **Gate.** Give the owner the clips and the table. Proceed only if they accept the speed and can hear the intensity change. Record the chosen variant and the measured ratio in the spec's Risks section, and apply the Pace removal to the spec. If the gate fails, stop: the approach is revisited before any further task.
- [ ] **Step 6:** Commit: `chore: scaffold project and prove ONNX engine on Intel`.

### Task 2: Shared logic

**Files:**
- Create: `src/shared/types.ts`, `src/shared/presets.ts`, `src/shared/splitText.ts`, `src/shared/wav.ts`
- Test: `tests/shared/presets.test.ts`, `tests/shared/splitText.test.ts`, `tests/shared/wav.test.ts`

**Interfaces — Produces:**

```ts
// types.ts
export type ExpressionId = 'neutral' | 'happy' | 'sad' | 'excited' | 'angry' | 'calm';
export interface GenParams { intensity: number; variation: number }   // intensity 0.25..2.0, variation 0..1.2
export interface Voice { id: string; name: string; createdAt: string;
  samples: Partial<Record<ExpressionId, string>> & { neutral: string } } // file names in voices/<id>/
export interface HistoryItem { id: string; voiceId: string; voiceName: string; text: string;
  expression: ExpressionId; params: GenParams; durationSec: number; file: string; createdAt: string }
export const SAMPLE_RATE = 24000;
export const MAX_CHUNK_CHARS = 250;

// presets.ts
export const PRESETS: Record<ExpressionId, { label: string } & GenParams>;
export function clampParams(p: GenParams): GenParams;

// splitText.ts
export function splitText(text: string, maxChars?: number): string[];

// wav.ts
export function encodeWav(samples: Float32Array, sampleRate?: number): Uint8Array;
export function concatSamples(parts: Float32Array[], gapSec?: number): Float32Array; // gap default 0.15
```

Preset starting values (retuned by ear after Task 1): neutral 0.5/0.6, happy 0.8/0.8, sad 0.35/0.5, excited 1.2/0.9, angry 1.0/0.7, calm 0.3/0.4 (intensity/variation).

- [ ] **Step 1: Write failing tests**

```ts
// splitText
expect(splitText('')).toEqual([]);
expect(splitText('   \n ')).toEqual([]);
expect(splitText('Hi there. How are you? Fine!')).toEqual(['Hi there. How are you? Fine!']); // short sentences merge up to maxChars
expect(splitText('One two three. Four five six.', 16)).toEqual(['One two three.', 'Four five six.']);
const long = Array(80).fill('word').join(' ');            // 399 chars, no punctuation
const parts = splitText(long);
expect(parts.every(p => p.length <= 250)).toBe(true);
expect(parts.join(' ')).toBe(long);                       // nothing dropped, no word cut
expect(splitText('a, b, c, d', 4)).toEqual(['a,', 'b,', 'c,', 'd']); // commas before spaces

// presets
expect(Object.keys(PRESETS)).toEqual(['neutral','happy','sad','excited','angry','calm']);
expect(clampParams({ intensity: 9, variation: -1 })).toEqual({ intensity: 2.0, variation: 0 });
expect(clampParams({ intensity: 0, variation: 5 })).toEqual({ intensity: 0.25, variation: 1.2 });

// wav
const w = encodeWav(new Float32Array([0, 1, -1]));
expect(w.length).toBe(44 + 6);
expect(new TextDecoder().decode(w.slice(0, 4))).toBe('RIFF');
expect(new DataView(w.buffer).getUint32(24, true)).toBe(24000);
expect(new DataView(w.buffer).getInt16(46, true)).toBe(32767);
expect(new DataView(w.buffer).getInt16(48, true)).toBe(-32767 /* or -32768 */);
expect(concatSamples([new Float32Array(10), new Float32Array(10)], 0.5).length).toBe(10 + 12000 + 10);
```

- [ ] **Step 2:** Run `npx vitest run tests/shared`. Expected: FAIL, modules not found.
- [ ] **Step 3:** Implement the four files to the signatures above. `splitText` splits on `.`, `!`, `?` followed by whitespace, merges neighbours while the result stays within `maxChars`, and breaks an over-long sentence on commas, then on spaces. Samples outside `[-1, 1]` are clipped in `encodeWav`.
- [ ] **Step 4:** Run `npx vitest run tests/shared`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: shared types, presets, text splitting, wav encoding`.

### Task 3: Engine

**Files:**
- Create: `src/engine/sampling.ts`, `src/engine/chatterbox.ts`, `src/engine/worker.ts`
- Test: `tests/engine/sampling.test.ts`, `tests/engine/chatterbox.integration.test.ts`

**Interfaces — Consumes:** `GenParams`, `SAMPLE_RATE` from Task 2.

**Interfaces — Produces:**

```ts
// sampling.ts
export function applyRepetitionPenalty(logits: Float32Array, seen: number[], penalty?: number): void; // in place, default 1.2
export function pickToken(logits: Float32Array, temperature: number, rand?: () => number): number;    // temperature 0 = argmax

// chatterbox.ts
export interface VoicePrompt { condEmb: Tensor; promptToken: Tensor; xVector: Tensor; promptFeat: Tensor }
export class ChatterboxEngine {
  static load(modelDir: string, lmVariant: string): Promise<ChatterboxEngine>;
  prepareVoice(audio24k: Float32Array): Promise<VoicePrompt>;
  generate(text: string, voice: VoicePrompt, params: GenParams,
           opts?: { maxNewTokens?: number; signal?: AbortSignal; onStep?: (n: number) => void }): Promise<Float32Array>;
}
export const MAX_NEW_TOKENS = 1000;

// worker.ts — messages over process.parentPort
type Req =
  | { id: number; type: 'load'; modelDir: string; lmVariant: string }
  | { id: number; type: 'generate'; chunks: string[]; samplePath: string; params: GenParams }  // samplePath: raw float32 24 kHz file
  | { id: number; type: 'cancel' };
type Evt =
  | { id: number; type: 'progress'; chunk: number; of: number }
  | { id: number; type: 'done'; samples: Float32Array }
  | { id: number; type: 'cancelled' }
  | { id: number; type: 'error'; message: string };
```

- [ ] **Step 1: Write failing sampling tests**

```ts
const l = new Float32Array([2, -2, 0]); applyRepetitionPenalty(l, [0, 1], 2);
expect(Array.from(l)).toEqual([1, -4, 0]);
expect(pickToken(new Float32Array([0.1, 5, 0.2]), 0)).toBe(1);
expect(pickToken(new Float32Array([0, 0, 0]), 1, () => 0.99)).toBe(2);
expect(pickToken(new Float32Array([0, 0, 0]), 1, () => 0.0)).toBe(0);
```

- [ ] **Step 2:** Run `npx vitest run tests/engine/sampling.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `sampling.ts`. Run again. Expected: PASS.
- [ ] **Step 4: Write the integration test** (skipped unless `OPENCLONE_MODEL_DIR` is set; point it at `proof/model`)

```ts
const engine = await ChatterboxEngine.load(dir, variant);
const voice = await engine.prepareVoice(readDefaultVoice24k());
const audio = await engine.generate('Hello there.', voice, { intensity: 0.5, variation: 0 });
expect(audio.length).toBeGreaterThan(0.4 * 24000);
expect(audio.length).toBeLessThan(8 * 24000);
expect(rms(audio)).toBeGreaterThan(0.005);                        // not silence
const capped = await engine.generate('Hello there.', voice, { intensity: 0.5, variation: 0 }, { maxNewTokens: 5 });
expect(capped.length).toBeGreaterThan(0);                         // cap returns audio, does not hang or throw
const ac = new AbortController(); ac.abort();
await expect(engine.generate('Hello.', voice, { intensity: 0.5, variation: 0 }, { signal: ac.signal }))
  .rejects.toThrow(/abort/i);
```

- [ ] **Step 5:** Implement `chatterbox.ts` by moving the proven loop out of `scripts/engine-proof.ts`, replacing argmax with `pickToken(logits, params.variation)`, checking `signal` each step, and stopping at `maxNewTokens`. The tokenizer is loaded from `modelDir/tokenizer.json` with `@huggingface/transformers`, with remote loading disabled.
- [ ] **Step 6:** Implement `worker.ts`: one engine instance, one job at a time, `VoicePrompt` cached by `samplePath`, chunks generated in order with a `progress` event after each, joined with `concatSamples`.
- [ ] **Step 7:** Run `OPENCLONE_MODEL_DIR=proof/model npx vitest run tests/engine`. Expected: PASS.
- [ ] **Step 8:** Commit: `feat: Chatterbox ONNX engine and worker`.

### Task 4: Main process — storage, model download, engine host

**Files:**
- Create: `electron.vite.config.ts`, `src/main/index.ts`, `src/main/store.ts`, `src/main/modelDownload.ts`, `src/main/engineHost.ts`, `src/preload/index.ts`
- Test: `tests/main/store.test.ts`, `tests/main/modelDownload.test.ts`

**Interfaces — Consumes:** worker `Req`/`Evt` (Task 3); `Voice`, `HistoryItem`, `splitText`, `encodeWav` (Task 2).

**Interfaces — Produces:**

```ts
// store.ts
export class Store {
  constructor(root: string);
  listVoices(): Voice[];
  createVoice(name: string, audio24k: Float32Array): Voice;          // writes voices/<id>/neutral.f32
  setExpressionSample(voiceId: string, e: ExpressionId, audio24k: Float32Array | null): Voice;
  renameVoice(id: string, name: string): Voice;
  deleteVoice(id: string): void;                                      // removes the folder
  samplePathFor(voiceId: string, e: ExpressionId): string;            // expression sample if present, else neutral
  listHistory(): HistoryItem[];                                       // newest first
  addHistory(item: Omit<HistoryItem, 'id' | 'file' | 'createdAt'>, wav: Uint8Array): HistoryItem;
  deleteHistory(id: string): void;
  historyPath(id: string): string;
}

// modelDownload.ts
export interface ModelFile { path: string; size: number }
export const MODEL_FILES: ModelFile[];                                // exact byte sizes recorded in Task 1
export function missingFiles(dir: string): ModelFile[];              // absent or wrong size
export function ensureModel(dir: string, onProgress: (done: number, total: number) => void,
                            fetchImpl?: typeof fetch): Promise<void>;

// preload: window.openclone
model:   { status(): Promise<'ready' | 'missing'>; download(): Promise<void>; onProgress(cb): () => void }
voices:  { list(); create(name, audio24k); setExpressionSample(id, e, audio24k | null); rename(id, name); remove(id) }
generate:{ start(req: { voiceId; text; expression; params }): Promise<HistoryItem>; cancel(): Promise<void>; onProgress(cb): () => void }
history: { list(); remove(id); audioUrl(id): Promise<string>; saveAs(id): Promise<boolean> }   // saveAs opens a save dialog
```

- [ ] **Step 1: Write failing tests** (temp directories; fake `fetch` for downloads)

```ts
// store
const v = store.createVoice('Me', new Float32Array(24000 * 5));
expect(store.listVoices()).toHaveLength(1);
expect(store.samplePathFor(v.id, 'happy')).toMatch(/neutral\.f32$/);
store.setExpressionSample(v.id, 'happy', new Float32Array(24000 * 4));
expect(store.samplePathFor(v.id, 'happy')).toMatch(/happy\.f32$/);
store.deleteVoice(v.id);
expect(fs.existsSync(path.join(root, 'voices', v.id))).toBe(false);
// history survives its voice being deleted, and a new Store on the same root reads it back
// a corrupt index.json is renamed to index.corrupt-<timestamp>.json and the store starts empty, without throwing

// modelDownload
// a file with the wrong size counts as missing
// ensureModel writes to "<name>.part" and renames only after the size matches
// a fetch that fails midway rejects, leaves no final file, and a second call resumes with a Range header
// a rejecting fetch (offline) rejects with a message containing "connection"
```

- [ ] **Step 2:** Run `npx vitest run tests/main`. Expected: FAIL.
- [ ] **Step 3:** Implement `store.ts` and `modelDownload.ts`. Index writes are atomic (write temp file, rename).
- [ ] **Step 4:** Run `npx vitest run tests/main`. Expected: PASS.
- [ ] **Step 5:** Implement `engineHost.ts` (spawns `worker.ts` with `utilityProcess.fork`, loads the model lazily on first generate, restarts the worker if it exits), `preload/index.ts`, and `main/index.ts`. `generate.start` runs `splitText`, rejects when it returns no chunks, sends the job, encodes the result with `encodeWav`, calls `store.addHistory`, and returns the item. Window: 1100 x 720, minimum 900 x 600, `contextIsolation: true`, `nodeIntegration: false`. History audio is served through a custom `openclone://` protocol restricted to the history folder.
- [ ] **Step 6:** Run `npx electron-vite build`. Expected: builds with no type errors.
- [ ] **Step 7:** Commit: `feat: storage, model download and engine host`.

### Task 5: Renderer — voices

**Files:**
- Create: `src/renderer/index.html`, `src/renderer/main.tsx`, `src/renderer/App.tsx`, `src/renderer/styles.css`, `src/renderer/audio.ts`, `src/renderer/components/VoiceList.tsx`, `src/renderer/components/NewVoiceSheet.tsx`, `src/renderer/components/ModelDownload.tsx`
- Test: `tests/renderer/audio.test.ts`

**Interfaces — Consumes:** `window.openclone` (Task 4).

**Interfaces — Produces:**

```ts
// audio.ts
export function decodeTo24kMono(file: Blob): Promise<Float32Array>;       // AudioContext.decodeAudioData + OfflineAudioContext
export type SampleCheck = { ok: true; audio: Float32Array } | { ok: false; reason: 'too-short' | 'silent' };
export function checkSample(audio: Float32Array): SampleCheck;             // pure
export function recordMic(): { stop(): Promise<Blob> };
```

- [ ] **Step 1: Write failing tests for `checkSample`**

```ts
expect(checkSample(noise(2.9))).toEqual({ ok: false, reason: 'too-short' });      // under 3 s
expect(checkSample(new Float32Array(24000 * 10))).toEqual({ ok: false, reason: 'silent' }); // rms < 0.005
const long = checkSample(noise(45));
expect(long.ok && long.audio.length).toBe(24000 * 30);                             // trimmed to first 30 s
expect(checkSample(noise(12)).ok).toBe(true);
```

- [ ] **Step 2:** Run `npx vitest run tests/renderer`. Expected: FAIL. Implement `audio.ts`. Run again. Expected: PASS.
- [ ] **Step 3:** Build the layout from the spec's screen sketch with the Global Constraints colours: left column 240 px with the voice list and "New voice"; system font stack; 8 px corner radius; selected items and primary buttons solid black with white text.
- [ ] **Step 4:** `ModelDownload` replaces the whole window while `model.status()` is `'missing'`: title "Downloading voice model", size, progress bar, and on failure the error with a Retry button.
- [ ] **Step 5:** `NewVoiceSheet`: name field; drop zone accepting WAV, MP3, M4A; Record button (asks for the microphone, shows elapsed time); guidance "10 to 30 seconds of clear speech"; required checkbox with the exact text `This is my voice, or I have permission to clone it.`; Save disabled until name, valid sample and checkbox are all present. `too-short` shows "That sample is under 3 seconds. Use 10 to 30 seconds of clear speech." `silent` shows "That sample is silent. Check the file or your microphone." An undecodable file shows "That file could not be read as audio."
- [ ] **Step 6:** Voice rows support rename and delete (delete asks for confirmation). If microphone permission is denied, the sheet shows "Microphone access is off. Allow it in System Settings, or upload a file instead."
- [ ] **Step 7:** Run the app with `npx electron-vite dev`. Create a voice from a file and one from the microphone; rename and delete one. Expected: all work and persist across a restart.
- [ ] **Step 8:** Commit: `feat: voices UI and first-launch download screen`.

### Task 6: Renderer — generate, expressions, history

**Files:**
- Create: `src/renderer/components/Composer.tsx`, `src/renderer/components/ExpressionPicker.tsx`, `src/renderer/components/History.tsx`, `src/renderer/components/ExpressionSamples.tsx`, `src/renderer/state.ts`
- Test: `tests/renderer/state.test.ts`

**Interfaces — Consumes:** `PRESETS`, `clampParams` (Task 2); `window.openclone` (Task 4); `decodeTo24kMono`, `checkSample`, `recordMic` (Task 5).

**Interfaces — Produces:**

```ts
// state.ts (pure reducer, no React)
export interface ComposerState { text: string; expression: ExpressionId; params: GenParams; busy: boolean; progress: [number, number] | null }
export function canGenerate(s: ComposerState, voiceId: string | null): boolean;
export function selectExpression(s: ComposerState, e: ExpressionId): ComposerState;   // loads that preset's params
```

- [ ] **Step 1: Write failing tests**

```ts
expect(canGenerate({ ...base, text: '   ' }, 'v1')).toBe(false);
expect(canGenerate({ ...base, text: 'Hi' }, null)).toBe(false);
expect(canGenerate({ ...base, text: 'Hi', busy: true }, 'v1')).toBe(false);
expect(canGenerate({ ...base, text: 'Hi' }, 'v1')).toBe(true);
expect(selectExpression(base, 'excited').params).toEqual({ intensity: 1.2, variation: 0.9 });
```

- [ ] **Step 2:** Run `npx vitest run tests/renderer/state.test.ts`. Expected: FAIL. Implement. Expected: PASS.
- [ ] **Step 3:** `Composer`: text area, `ExpressionPicker` (six pills in preset order), Intensity slider (0.25 to 2.0, step 0.05) and Variation slider (0 to 1.2, step 0.05), Generate button. While busy the button reads "Cancel" and a line shows "Generating part N of M". Errors from `generate.start` show inline under the button.
- [ ] **Step 4:** `History`: newest first; each row shows the text (one line, truncated), expression, duration, a play/pause button, Save (calls `history.saveAs`) and Delete. A finished generation is inserted at the top and starts playing.
- [ ] **Step 5:** `ExpressionSamples`: opened from a voice row; one line per non-neutral expression with Record, Upload and Remove, using the same checks and messages as `NewVoiceSheet`. An expression that has its own sample shows a small dot on its pill.
- [ ] **Step 6:** Run the app. Generate a short line, a three-paragraph text (confirm progress and Cancel), and the same line in all six expressions. Expected: audio plays, saved WAV opens in QuickTime, history persists across a restart.
- [ ] **Step 7:** Retune `PRESETS` by ear with the owner; update the preset test's expected values to match.
- [ ] **Step 8:** Commit: `feat: generation, expressions and history UI`.

### Task 7: Packaging

**Files:**
- Create: `electron-builder.yml`, `README.md`, `THIRD_PARTY_LICENSES.md`, `build/icon.icns`, `build/entitlements.mac.plist`
- Modify: `package.json` (scripts `dist:x64`, `dist:arm64`, `dist`)

- [ ] **Step 1:** `electron-builder.yml`: `appId: com.staticscodes.openclone`, `productName: Open Clone`, `mac.target: dmg`, `mac.minimumSystemVersion: "12.0"`, `artifactName: Open-Clone-${version}-${arch}.dmg`, `extendInfo.NSMicrophoneUsageDescription: "Open Clone records your voice to create a voice clone. Recordings stay on this Mac."`, `asarUnpack` for `onnxruntime-node` native files, and a `files` filter that keeps only the target arch's `onnxruntime-node/bin/**/darwin/<arch>` folder. `identity: null` until the owner decides on signing.
- [ ] **Step 2:** Run `npm run dist:x64`. Expected: `dist/Open-Clone-0.1.0-x64.dmg`.
- [ ] **Step 3:** Install from the DMG into `/Applications`, launch with the user-data folder moved aside, and run the full flow: model download, new voice, generate, save. Expected: the whole flow works from the installed app alone, with the dev server stopped and without reading anything from the project folder.
- [ ] **Step 4:** Run `npm run dist:arm64`. Expected: `dist/Open-Clone-0.1.0-arm64.dmg`. Verify with `lipo -archs` on the app binary and on the bundled `onnxruntime` `.node` file. Expected: `arm64` for both. This build is not run on this machine; record that in `README.md` until it has been tested on Apple Silicon.
- [ ] **Step 5:** `README.md`: what it is, the two downloads, building from source, where data is stored, the consent rule, the model's licence and credit to Resemble AI. `THIRD_PARTY_LICENSES.md` generated from production dependencies; fail the step if any licence is not MIT, Apache-2.0, BSD or ISC.
- [ ] **Step 6:** Run `npx vitest run`. Expected: all tests PASS.
- [ ] **Step 7:** Commit: `build: package Intel and Apple Silicon dmg`.

## Open decisions carried from the spec

- Signing and notarisation (needs the owner's Apple Developer ID). Task 7 ships unsigned builds until then.
- Automated Apple Silicon testing on GitHub (needs a public repository).
