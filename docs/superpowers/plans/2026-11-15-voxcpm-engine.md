# VoxCPM2 Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Open Clone's Chatterbox engine with VoxCPM2 in continuation mode, on both the Intel and Apple Silicon builds, so clones are made exactly the way the owner's approved clips were made.

**Architecture:** The Electron main process starts a private Python (shipped inside the app) running one helper script, and talks to it in JSON lines over stdin/stdout; audio moves as files. `EngineHost` keeps its role and gains `transcribe`. A pure TypeScript function turns (voice, expression) into the exact model inputs ("the recipe"). The ONNX engine, its runtime and its sliders are removed.

**Tech Stack:** Electron 45, electron-vite, React, TypeScript, vitest; Python 3.12 (python-build-standalone), PyTorch (2.2.2 on Intel, 2.5.1 on Apple Silicon), `voxcpm` 2.0.3, `faster-whisper`; electron-builder.

**Spec:** `docs/superpowers/specs/2026-11-15-voxcpm-engine-design.md` (and `2026-11-14-open-clone-design.md` for everything it does not replace).

## Global Constraints

- The recipe, per sentence: `reference_wav_path` = voice sample; `prompt_wav_path` = same sample; `prompt_text` = `(<instruction>)` + transcript (no parentheses for Neutral); `cfg_value` 2.0; `inference_timesteps` 10; float32 on CPU.
- Tone instructions, verbatim: Happy `happy, warm, smiling tone`; Sad `sad, slow, quiet tone`; Excited `excited, cheerful tone`; Angry `angry, forceful tone`; Calm `calm, soft, relaxed tone`; Neutral none.
- A voice with its own sample for an expression: that sample and its transcript are the prompt, no instruction; the main sample stays the reference.
- Never fall back to reference-only mode.
- Main voice sample: exactly one minute (minimum 60 s, trimmed to 60 s). Expression samples: minimum 10 s. Already built; do not change.
- Samples on disk stay raw float32, 24 kHz mono. Model output is 48 kHz mono.
- No audio or text leaves the machine. Network use is the model download only.
- Buyers install nothing by hand. Minimum macOS 12. Ad-hoc signing (`identity: "-"`).
- Model: `openbmb/VoxCPM2` at revision `7936080b41163874f38610f46f438e2c0757f9fd`. Transcription: `Systran/faster-whisper-small.en`.
- Intel PyTorch is 2.2.2 and needs the grouped-query attention patch (see Task 1). Apple Silicon uses 2.5.1 so `torchaudio.load` needs no extra codec library.
- UI copy is plain English; colours stay black, white and grey, with red only on the recording screen.
- Commits use the owner's git identity only. No co-author trailer. Do not push and do not create a GitHub repository.

## Review Focus

1. The helper process fails to start or dies mid-job (missing Python, crash, out of memory): the user sees "The voice engine stopped unexpectedly. Try again." and the next request starts a fresh helper. (Task 2)
2. A sample with no intelligible speech (music, silence that passed the level check): transcription comes back empty and the voice is refused with a clear message, not saved with an empty prompt. (Task 3)
3. A voice saved before this change (30 s, no transcript): it is transcribed on first use and generates normally. (Task 3)
4. Cancel while the model is still loading, and cancel mid-sentence: the app returns to idle, no history row appears, and the next Generate works without restarting the app. (Tasks 1, 2)
5. An interrupted 5 GB download: relaunching resumes instead of starting over, and a file of the wrong size is never treated as complete. (Task 5)

---

### Task 1: Engine helper, verified outside the app

**Files:**
- Create: `python/engine.py`, `python/requirements-x64.txt`, `python/requirements-arm64.txt`, `python/test_engine.py`
- Create: `scripts/build-python-runtime.sh`
- Modify: `.gitignore` (add `build/python-*/`)

**Interfaces:**
- Produces: `build/python-<arch>/bin/python3` (a relocatable Python with all packages), and the helper protocol below, one JSON object per line.

Requests (stdin):
```
{"id":1,"type":"load","modelDir":"…/voxcpm2","whisperDir":"…/whisper-small.en"}
{"id":2,"type":"transcribe","samplePath":"…/neutral.f32"}
{"id":3,"type":"generate","chunks":["…"],"referencePath":"…f32","promptPath":"…f32","promptText":"…","outPath":"…/out.f32"}
{"id":3,"type":"cancel"}
```
Events (stdout): `{"id":1,"type":"loaded"}`, `{"id":2,"type":"transcript","text":"…"}`, `{"id":3,"type":"progress","chunk":1,"of":4}`, `{"id":3,"type":"done","sampleRate":48000,"samples":123456}`, `{"id":3,"type":"cancelled"}`, `{"id":n,"type":"error","message":"…"}`. Nothing else may be written to stdout; logs go to stderr.

- [ ] **Step 1: Write `scripts/build-python-runtime.sh <x64|arm64>`.** Downloads the python-build-standalone 3.12 `install_only_stripped` archive for `x86_64-apple-darwin` or `aarch64-apple-darwin` into `build/python-<arch>/`, then installs the matching requirements file into its `site-packages` with `pip install --target … --only-binary=:all:` (for arm64 add `--platform macosx_11_0_arm64 --python-version 3.12`), then `voxcpm==2.0.3` with `--no-deps`. Requirements: x64 `torch==2.2.2 torchaudio==2.2.2 numpy<2 llvmlite==0.43.0 numba==0.60.0`; arm64 `torch==2.5.1 torchaudio==2.5.1`; both `transformers einops inflect addict wetext huggingface-hub pydantic tqdm simplejson sortedcontainers soundfile librosa safetensors faster-whisper`. Remove `__pycache__`, tests and `*.dist-info/RECORD`-irrelevant bulk (torch `include/`, `test/`).
- [ ] **Step 2: Run it for x64.** Expected: `build/python-x64/bin/python3 -c "import torch, voxcpm, faster_whisper; print(torch.__version__)"` prints `2.2.2`.
- [ ] **Step 3: Write `python/test_engine.py`** (plain `unittest`, no model needed): `prompt_text` and paths are passed to the model untouched (use a fake model object); a `cancel` for the running id yields a `cancelled` event and no `done`; an unknown request type yields an `error` event with the same id; stdout carries only JSON lines.
- [ ] **Step 4: Run it and see it fail.** `build/python-x64/bin/python3 -m unittest python/test_engine.py` — FAIL, no `engine` module.
- [ ] **Step 5: Write `python/engine.py`.** Reads requests on the main thread; runs each job on one worker thread so `cancel` can arrive mid-job. On import, when `torch` is older than 2.5, wrap `torch.nn.functional.scaled_dot_product_attention` to accept `enable_gqa` by repeating key and value heads to match the query heads. `load`: on CPU, point the model at a copy of its folder whose `config.json` has `"dtype": "float32"` (symlink the other files); call `VoxCPM.from_pretrained(dir, load_denoiser=False, optimize=False)`; device `mps` when available, else `cpu`. Whisper loads lazily on the first `transcribe` (`WhisperModel(whisperDir, device="cpu", compute_type="int8")`, `language="en"`). Before use, each `.f32` sample is peak-normalised to 0.9 and written as a 24 kHz WAV in a temp folder (cached by path and mtime). `generate`: for each chunk call `generate_streaming(text=chunk, reference_wav_path=…, prompt_wav_path=…, prompt_text=…, cfg_value=2.0, inference_timesteps=10)`, checking the cancel flag between yielded pieces; emit `progress` before each chunk; join chunks with 0.25 s of silence; write float32 to `outPath`.
- [ ] **Step 6: Run the unit tests.** Expected: PASS.
- [ ] **Step 7: Real-model check on this Mac.** Drive the helper by hand with the owner's 23 s prompt (`proof/candidates/ref-four.wav` converted to `.f32`) and the Excited instruction; transcribe the output with Whisper and confirm it equals the input sentence. Record model load time, peak memory (`/usr/bin/time -l`), and time per sentence for a 60 s prompt (loop the owner's 48 s clips to 60 s). Write the numbers into the spec's "Constraints and measurements".
- [ ] **Step 8: Send the owner one Neutral and one Excited clip from the helper** to confirm they match the approved clips, then continue (do not wait: the recipe is unchanged; if they object, stop and revisit).
- [ ] **Step 9: Commit.** `feat: VoxCPM2 engine helper and private Python runtime build`

### Task 2: Engine host talks to the helper; Chatterbox removed

**Files:**
- Modify: `src/main/engineHost.ts`, `src/engine/protocol.ts` → move to `src/main/engineProtocol.ts`
- Delete: `src/engine/` (chatterbox.ts, sampling.ts, worker.ts), `tests/engine/`, `src/shared/level.ts`, `tests/shared/level.test.ts`, `scripts/engine-proof.ts`, `scripts/voice-similarity.ts`, `scripts/speaker-match.ts`
- Modify: `package.json` (remove `onnxruntime-node`, `@huggingface/tokenizers`, the `proof` script), `electron.vite.config.ts` (drop the worker entry)
- Test: `tests/main/engineHost.test.ts`

**Interfaces:**
- Consumes: the helper protocol from Task 1.
- Produces:
```ts
export interface EnginePaths { python: string; script: string; modelDir: string; whisperDir: string }
export interface GenerateJob { chunks: string[]; referencePath: string; promptPath: string; promptText: string; outPath: string }
export class EngineHost {
  constructor(paths: EnginePaths, spawnImpl?: typeof spawn)
  get busy(): boolean
  transcribe(samplePath: string): Promise<string>
  generate(job: GenerateJob, onProgress: (chunk: number, of: number) => void): Promise<{ sampleRate: number; samples: number }>
  warm(): void; cancel(): void; dispose(): void
}
export class CancelledError extends Error {}
```

- [ ] **Step 1: Write failing tests** with a fake child process (an object with `stdin.write`, `stdout`/`stderr` emitters, `kill`, `on('exit')`): `load` is sent once before the first job; a `progress` line reaches `onProgress`; output split across two stdout chunks still parses; `error` rejects with its message; child exit rejects pending work with "The voice engine stopped unexpectedly. Try again." and the next call spawns a new child; `cancel()` during load makes `generate` reject with `CancelledError` without sending `generate`; `cancel()` mid-job writes a `cancel` line with the job's id; a second `generate` while busy rejects with "Another generation is already running."
- [ ] **Step 2: Run them, see them fail.** `npx vitest run tests/main/engineHost.test.ts`
- [ ] **Step 3: Rewrite `EngineHost`** on `child_process.spawn(python, ['-u', script])`, buffering stdout by line. Keep the existing public behaviour and error strings.
- [ ] **Step 4: Delete the Chatterbox files and dependencies listed above;** run `npm install`.
- [ ] **Step 5: Run all tests and `npm run typecheck`.** Expected: PASS apart from callers fixed in Tasks 3–4 (fix imports only as far as needed to compile).
- [ ] **Step 6: Commit.** `feat: engine host drives the VoxCPM helper; remove Chatterbox`

### Task 3: Recipe, transcripts and voice saving

**Files:**
- Create: `src/shared/recipe.ts`; Test: `tests/shared/recipe.test.ts`
- Modify: `src/shared/types.ts`, `src/shared/presets.ts`, `src/shared/api.ts`, `src/shared/wav.ts`, `src/main/store.ts`, `src/main/index.ts`, `src/preload/index.ts`
- Test: `tests/main/store.test.ts`, `tests/shared/presets.test.ts`, `tests/shared/wav.test.ts`

**Interfaces:**
- Consumes: `EngineHost.transcribe`, `EngineHost.generate` (Task 2).
- Produces:
```ts
// types.ts
export interface Voice { id; name; createdAt; samples; transcripts?: Partial<Record<ExpressionId, string>> }
export interface HistoryItem { …; params?: unknown /* legacy rows only */ }   // GenParams is deleted
export const SAMPLE_RATE = 24000;   // voice samples
export const OUTPUT_RATE = 48000;   // generated speech
// presets.ts
export const PRESETS: Record<ExpressionId, { label: string; instruction: string | null }>
// recipe.ts
export function buildRecipe(voice: Voice, e: ExpressionId, samplePath: (file: string) => string):
  { referencePath: string; promptPath: string; promptText: string }
// store.ts
setTranscript(voiceId: string, e: ExpressionId, text: string): Voice
// api.ts
GenerateRequest = { voiceId: string; text: string; expression: ExpressionId }
```

- [ ] **Step 1: Failing recipe tests.** Neutral: `promptText` equals the transcript, prompt and reference are the neutral sample. Excited: `promptText === '(excited, cheerful tone)' + transcript`. One test per instruction string in Global Constraints. Voice with its own `sad` sample and transcript: prompt is the sad sample, `promptText` is the sad transcript with no parentheses, reference is the neutral sample. Missing transcript for the sample in use: throws `Error('This voice has not been transcribed yet.')`.
- [ ] **Step 2: Run, fail; implement `recipe.ts` and the new `PRESETS`; run, pass.**
- [ ] **Step 3: `encodeWav(samples, sampleRate)`** takes the rate as a required argument; update its test for 48000.
- [ ] **Step 4: Store.** Failing tests then code: `setTranscript` persists; `setExpressionSample` with new audio clears that expression's transcript; removing a sample removes its transcript; an index written by the old version (no `transcripts`) loads.
- [ ] **Step 5: Main process.** `voices:create` and `voices:setExpressionSample` save the sample, call `engine.transcribe`, and store the text; if the text is empty after trimming, undo the save and throw `Error('No speech could be heard in that sample. Record or choose another one.')`. `generate:start`: if the sample in use has no transcript, transcribe and store it first; build the job with `buildRecipe`; `outPath` is a temp file in the history folder; on `done`, read the float32 file, `encodeWav(samples, OUTPUT_RATE)`, add the history row, delete the temp file; `durationSec = samples / OUTPUT_RATE`. Remove `clampParams` and `params`.
- [ ] **Step 6: Run all tests and typecheck. Commit.** `feat: continuation recipe, transcripts stored with voices`

### Task 4: Composer, expressions and Intel notice

**Files:**
- Modify: `src/renderer/state.ts`, `src/renderer/components/Composer.tsx`, `src/renderer/components/NewVoiceSheet.tsx`, `src/renderer/components/ExpressionSamples.tsx`, `src/renderer/components/VoiceList.tsx`, `src/renderer/App.tsx`, `src/renderer/styles.css`, `src/shared/api.ts`, `src/preload/index.ts`, `src/main/index.ts`
- Create: `src/renderer/estimate.ts`; Test: `tests/renderer/estimate.test.ts`, `tests/renderer/state.test.ts`

**Interfaces:**
- Produces: `api.system.slowEngine(): Promise<boolean>` (true when `process.arch === 'x64'`); `estimateRemaining(doneChunks: number, of: number, elapsedSec: number): number | null` (null until one chunk is done).

- [ ] **Step 1: Failing tests** for `estimateRemaining` (`(1, 4, 120)` → `360`; `(0, 4, 50)` → `null`; `(4, 4, 400)` → `0`) and for `ComposerState` without `params`.
- [ ] **Step 2: Implement; remove both sliders and their CSS.**
- [ ] **Step 3: Copy.** When `slowEngine` is true, under Generate while idle: "On this Mac a sentence takes a few minutes." While busy: `Sentence 2 of 5 · 3:10 elapsed · about 6 min left` (omit the estimate until one sentence is done; before the model has loaded: "Loading the voice model…"). Saving a voice shows "Transcribing your sample…" with the Save button disabled until it finishes. A voice whose main sample is under 60 s shows the note "Recorded under the old limit. A one-minute sample is more accurate." in the voice list.
- [ ] **Step 4: Run tests, typecheck, and look at the screens in the built app. Commit.** `feat: composer without sliders, Intel speed notice and estimates`

### Task 5: First-launch download of both models

**Files:**
- Modify: `src/main/modelDownload.ts`, `src/main/index.ts`, `src/renderer/components/ModelDownload.tsx`
- Test: `tests/main/modelDownload.test.ts`

**Interfaces:**
- Produces: `MODEL_SETS: { dir: string; baseUrl: string; files: ModelFile[] }[]`; `missingSets(root): …`; `ensureModels(root, onProgress, fetchImpl?)` reporting one combined done/total.

- [ ] **Step 1: Get exact byte sizes.** VoxCPM2 at the pinned revision: `config.json` 4336, `model.safetensors` 4580080592, `audiovae.pth` 376951122, `tokenizer.json` 3676772, `tokenizer_config.json` 5059, `special_tokens_map.json` 1632, `tokenization_voxcpm2.py` 2895. For `Systran/faster-whisper-small.en`, read file names and sizes from `https://huggingface.co/api/models/Systran/faster-whisper-small.en/tree/main` and pin the revision it reports. Directories: `models/voxcpm2`, `models/whisper-small.en`.
- [ ] **Step 2: Failing tests:** combined progress runs from 0 to the sum of both sets; a set that is complete is skipped; the existing resume and wrong-size tests still pass per file.
- [ ] **Step 3: Implement.** On startup, delete the old `models/chatterbox` folder if present. The download screen states the total size.
- [ ] **Step 4: Run tests. Commit.** `feat: download VoxCPM2 and the transcription model on first launch`

### Task 6: Packaging both installers

**Files:**
- Modify: `electron-builder.yml`, `package.json` scripts, `README.md`, `THIRD_PARTY_LICENSES.md`, `scripts/e2e-smoke.ts`

- [ ] **Step 1: `electron-builder.yml`.** Remove the onnxruntime entries. Add `extraResources`: `build/python-${arch}` → `python`, `python/engine.py` → `engine/engine.py`. In the main process, the helper paths are `process.resourcesPath/python/bin/python3` and `…/engine/engine.py` when packaged, and `build/python-x64/…` and `python/engine.py` in development.
- [ ] **Step 2: Scripts.** `dist:x64` and `dist:arm64` each run `scripts/build-python-runtime.sh` for their chip first.
- [ ] **Step 3: Build both.** Check each app with `lipo -archs` on `python/bin/python3` and on torch's main library (`x86_64` and `arm64` respectively), and `codesign --verify --deep`.
- [ ] **Step 4: End-to-end on the packaged Intel app** (`scripts/e2e-smoke.ts` with `proof/sample-65s.wav`): model present, new one-minute voice is transcribed and saved, Generate with Excited produces a history row whose audio transcribes back to the input sentence, Cancel mid-sentence leaves no row and a second Generate works, cleanup. Allow for multi-minute generation in the timeouts.
- [ ] **Step 5: Docs.** README: one-minute sample, download size, Intel speed, 16 GB note if Task 1's memory figure calls for it. `THIRD_PARTY_LICENSES.md`: VoxCPM2 (Apache-2.0), PyTorch (BSD-3), Python (PSF), faster-whisper and CTranslate2 (MIT), Whisper small.en (MIT), and the Python packages shipped; remove Chatterbox, onnxruntime and tokenizers.
- [ ] **Step 6: Commit.** `feat: package the Python runtime in both installers; docs and licences`
