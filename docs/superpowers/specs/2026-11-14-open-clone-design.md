# Open Clone — design

Date: 2026-11-14
Status: approved 2026-11-14; amended during build (see Amendments)

## Intent

Open Clone is an open source Mac desktop app that does the core of what
ElevenLabs does, entirely on the user's own machine: upload a sample of your
voice, type text, choose an expression (happy, sad, excited, ...) and get
speech back in your voice.

The owner wants to release the source openly and also sell ready-to-run
downloads on their own store, staticscodes.com. Buyers pay for the
convenience of a packaged app, so the packaged app has to install and work
without a terminal.

## Goals

- Clone a voice from one uploaded or recorded sample.
- Generate speech from typed text in that voice.
- Named expressions that audibly change the delivery.
- A simple, mostly white UI with black accents.
- Two downloads from one codebase: Intel (`x64`) and Apple Silicon (`arm64`).
- Everything local: no accounts, no cloud, no telemetry.
- Every dependency and the model licensed for commercial sale.

## Non-goals (first version)

- Windows or Linux builds.
- Languages other than English.
- Voice-to-voice conversion, dubbing, sound effects, an API.
- Speech-to-text (Whisper) features.
- Licence keys, payments or copy protection inside the app.
- Mac App Store distribution.
- MP3 export (WAV only).

## Anti-goals

- Voice samples or generated audio leaving the machine. The only network
  call is the one-time model download.
- Cloning without the user confirming the voice is theirs or that they have
  permission.
- A build that needs Python, Homebrew or a terminal to run.

## Constraints

- Development machine is a 2017 Intel MacBook Pro (i7-7820HQ, 16 GB,
  macOS 13.7). The Intel build can be tested here. The Apple Silicon build
  cannot be run here.
- PyTorch has shipped no Intel Mac builds since 2.2.2, and Chatterbox needs
  2.6, so a PyTorch-based engine cannot serve the Intel version.
- Intel has no usable GPU. Generation is CPU-only and expected to be slower
  than real time. Actual speed is not yet measured.
- Chatterbox exposes an "exaggeration" intensity control, not named
  emotions. Named expressions have to be built on top of it.

## Approaches considered

**A. Electron + ONNX Runtime (chosen).** The Chatterbox ONNX export runs
inside the app through `onnxruntime-node`. One codebase, two builds, no
Python. Small app download; the model is fetched on first launch.

**B. Electron + bundled Python and PyTorch.** Closest to upstream
Chatterbox, but blocked on Intel by the PyTorch cutoff, and each build
would be over 2 GB.

**C. Native Swift + MLX.** Fastest on Apple Silicon, but MLX does not run
on Intel, so Intel would need a second engine and a second codebase, and
the fast half could not be tested on the development machine.

The owner chose A, skipping a throwaway speed and quality test. Because
that test was skipped, the engine is proven first in the build order (see
Build order) and the two unverified points are carried as risks.

## The app

### Screen

One window, three areas.

```
+----------------+---------------------------------------------+
| OPEN CLONE     |  Text                                       |
|                |  +---------------------------------------+  |
| Voices         |  | Type what you want your voice to say  |  |
|  * My voice    |  |                                       |  |
|    Narrator    |  +---------------------------------------+  |
|                |                                             |
| [+ New voice]  |  Expression                                 |
|                |  (Neutral) (Happy) (Sad) (Excited)          |
|                |  (Angry) (Calm)                             |
|                |                                             |
|                |  Intensity   ----o-------                   |
|                |  Pace        ------o-----                   |
|                |  Variation   ---o--------                   |
|                |                                             |
|                |  [ Generate ]                               |
|                +---------------------------------------------+
|                |  History                                    |
|                |  > "Hello there..."  Happy   0:04  [Save]   |
|                |  > "Good morning"    Sad     0:02  [Save]   |
+----------------+---------------------------------------------+
```

White background, black text and controls, one grey for borders and
secondary text. No colour accents. The selected expression and the
Generate button are solid black with white text.

### Voices

- "New voice" opens a sheet: name, then either drop an audio file (WAV,
  MP3, M4A) or record with the microphone. Guidance says 10 to 30 seconds
  of clear speech.
- A required checkbox: "This is my voice, or I have permission to clone
  it." The voice cannot be saved without it.
- The sample is decoded and resampled in the app with the browser's own
  audio decoder, so no ffmpeg is bundled.
- Voices are stored locally and can be renamed and deleted. Deleting a
  voice deletes its sample.

### Expressions

Six presets: Neutral, Happy, Sad, Excited, Angry, Calm. Each preset is a
set of values for the engine's controls (intensity, pace, variation). The
three sliders show the preset's values and can be adjusted by hand.

Optional per-expression samples: Chatterbox imitates the delivery of the
sample it is given. A voice can hold an extra short sample per expression
("record yourself sounding happy"). When one exists, that expression uses
it instead of the main sample. This is the fallback if presets alone do
not sound distinct enough.

### Generating

- Text is split into sentences and generated piece by piece, so long text
  shows progress and can be cancelled.
- Finished audio appears in History with play, save as WAV, and delete.
  History persists between launches.
- Generation runs off the UI thread, so the window stays responsive.

### First launch

The app is small. On first launch it shows a one-time "Downloading voice
model" screen with size and progress, fetches the model from Hugging Face,
and verifies it. After that the app works offline.

## Technical shape

- **Shell:** Electron, TypeScript, React, Vite.
- **Engine:** `onnxruntime-node` running `onnx-community/chatterbox-ONNX`
  in a separate process from the UI. CPU execution on both chips.
- **Engine boundary:** the UI talks to the engine through one small
  interface (load model, prepare voice, generate, cancel, progress). The
  engine can be replaced later, for example with a faster Apple Silicon
  engine, without touching the UI.
- **Storage:** `~/Library/Application Support/Open Clone/` holding
  `models/`, `voices/` and `history/`, with a small JSON index.
- **Packaging:** `electron-builder` producing
  `Open-Clone-<version>-x64.dmg` and `Open-Clone-<version>-arm64.dmg`.
- **Minimum macOS:** 12.
- **Licence:** MIT for the app. Third-party licences listed in the repo
  and in an About screen.

## Risks

1. **Intel speed is unmeasured.** If it is too slow to be usable, options
   are a quantised model or shorter chunks. Measured in step 1.
2. **Expression presets may not sound distinct.** Mitigated by
   per-expression samples. Judged by ear in step 1.
3. **`onnxruntime-node` on Intel Mac.** Current releases may have dropped
   Intel Mac binaries. If so, pin the last release that ships them.
4. **Apple Silicon build is untested on real hardware.** See open
   decisions.
5. **Which controls the ONNX export exposes.** Intensity is expected; pace
   and variation may need to be applied in the app's own sampling code.

## Build order

1. Engine proof on this Mac: model loads, one sentence generated in a
   cloned voice, timed, at several expression settings. The owner listens.
   If this fails on speed or quality, stop and revisit the approach.
2. App shell and UI with a stub engine.
3. Voices: upload, record, consent, storage.
4. Real engine wired in: generation, progress, cancel, history, WAV save.
5. Expression presets and per-expression samples.
6. First-launch model download.
7. Packaging: both `.dmg` files.

## Testing

- Unit tests for text splitting, preset values, storage and WAV writing.
- An engine test on Intel that generates a short clip and checks it is
  non-silent audio of plausible length.
- Manual run-through of the packaged Intel app.
- Apple Silicon: depends on the open decision below.

## Open decisions for the owner

1. **Signing.** Without an Apple Developer ID (99 USD a year), buyers see
   a "cannot be opened, unidentified developer" warning and must right-click
   to open. With one, the apps are signed and notarised and open normally.
2. **Testing the Apple Silicon build.** GitHub offers free Apple Silicon
   build machines for public repositories. Publishing the repo there would
   let the arm64 build be built and smoke-tested automatically. Otherwise
   it ships untested until someone runs it on an M-series Mac.

## Left to the builder

- Exact preset values, tuned by ear in step 1.
- Component structure and state management in the UI.
- Model file verification method and download resume behaviour.
- JSON index format.

## Amendments made during the build

- **Pace slider removed.** The model export has no pace control. Controls are Intensity and Variation.
- **Red is allowed in one place:** the recording screen (live waveform, REC marker, stop button), at the owner's request.
- **Sample length:** minimum 10 seconds, maximum 30 (longer clips are trimmed). Quiet or distorted samples get a warning.
- **Runtime pinned to `onnxruntime-node` 1.23.2**, the last release with an Intel Mac binary (risk 3 came true).
- **Model variant: `language_model_q4`.** First-launch download is 1.55 GB.
- **Measured on the 2017 Intel MacBook Pro:** 5 to 11 seconds of work per second of speech; model load 90 to 140 seconds; about
  1.8 GB of memory. The half-precision variant was no faster and used 4 GB.
- **Owner has not yet listened to the proof clips.** The go/no-go on voice quality and on how distinct the expressions sound is
  still open.
