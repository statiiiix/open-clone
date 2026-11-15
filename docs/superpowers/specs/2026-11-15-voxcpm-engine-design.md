# Open Clone — new voice engine (VoxCPM2)

Date: 2026-11-15
Status: awaiting owner approval
Supersedes the engine parts of `2026-11-14-open-clone-design.md`. Everything not mentioned here (window layout, voices list,
history, consent checkbox, local-only rule, MIT licence, two installers) stays as that document says.

## Intent

The first version cloned voices with Chatterbox. The owner listened to clones of their own voice and judged them to have "zero
correlation". The same recordings through VoxCPM2, in one particular mode, produced a neutral clone the owner called "amazing"
and an excited clone that "sounds good". The owner approved building the app on that.

This change replaces the engine so that every user gets the quality the owner heard.

## What the owner heard and chose

All listening used twelve clips of the owner's narration (48 seconds in total).

| Tried | Owner's verdict |
|---|---|
| Chatterbox (current app), microphone sample and video clips | Nothing like me |
| Pocket TTS | Not better; drops words |
| VoxCPM2, reference-only mode | Worse than continuation mode |
| VoxCPM2, continuation mode, 6 s prompt | Much better, room to improve |
| Same, 12 s prompt | Better still, slightly robotic |
| Same, 23 s prompt | Very accurate |
| Same, 48 s prompt | Amazing; the best |
| Tone instruction in reference-only mode | Awful, robotic |
| Tone instruction at the very start of the prompt transcript, continuation mode | Sounds good (excited) |

Decisions the owner made:

- Build on VoxCPM2 in continuation mode.
- A voice sample is one full minute. One minute is the minimum, not a suggestion.
- The same engine on Intel and Apple Silicon, accepting that Intel is slow.
- The recorder coaches the speaker live and shows enough text to fill the minute (already built).

## Goals

- The clone a user hears is made the way the owner's approved clips were made.
- Six expressions: Neutral, Happy, Sad, Excited, Angry, Calm.
- Still nothing to install by hand: no Python, Homebrew or terminal for the buyer.
- Still fully local. The only network use is the one-time download.
- The Intel app is honest about its speed before and during generation.

## Non-goals

- Making Intel fast. It is slow by the owner's choice.
- Training a personal model on the user's voice (VoxCPM2 supports it; it needs a GPU). Possible later.
- Languages other than English, although the model supports 30.
- Keeping Chatterbox as a fallback. One engine only.

## Anti-goals

- A clone made any other way than the approved recipe, for example falling back to reference-only mode to save time.
- Hiding the wait on Intel behind a spinner with no estimate.
- Any audio or text leaving the machine.

## Constraints and measurements

- VoxCPM2 is a PyTorch model. There is no ONNX export of it, so it cannot run in the app's current ONNX runtime.
- The last PyTorch for Intel Macs is 2.2.2. VoxCPM2 asks for 2.5 or newer but runs on 2.2.2 with one small patch (grouped-query
  attention) and with its number format switched from bfloat16 to float32. Both were done by hand during listening tests.
- Measured on the 2017 Intel MacBook Pro, float32, CPU: model load 76 s; one sentence of about 5 s takes 2 to 2.5 minutes with
  a 23 s prompt and 3 to 4.5 minutes with a 48 s prompt. A 60 s prompt is not measured and will be slower still.
- Memory use is not measured. The model file is 4.6 GB, so expect well over 5 GB in use. Macs with 8 GB may not cope.
- Apple Silicon speed is not measured and cannot be on this machine.
- Downloads: model 4.96 GB (`model.safetensors` 4.58 GB, `audiovae.pth` 0.38 GB, small config and tokenizer files).
- Licences: VoxCPM2 Apache-2.0, PyTorch BSD, Python PSF, faster-whisper and Whisper models MIT. All allow commercial sale.

## Approaches

**How Intel is handled (owner's decision).**
1. Same engine on both, Intel slow. *Chosen:* Intel users get the accurate clone, and the owner can test the real product on
   the only Mac available.
2. New engine on Apple Silicon, Chatterbox on Intel. Rejected: Intel keeps the clone the owner rejected.
3. Apple Silicon only. Rejected: nothing could be run or tested on the owner's Mac.

**How the model runs inside the app (builder's call).**
1. A private copy of Python and PyTorch inside the app, run as a helper process. *Chosen:* it is the form the model was
   verified in, so quality matches what the owner heard.
2. Convert the model to ONNX and keep the current runtime. Rejected for now: a large, uncertain conversion, and any difference
   in output would have to be re-judged by ear.
3. Run the model on a server. Rejected: breaks the local-only rule.

## The design

### The recipe (must match the approved clips)

For each sentence:

- `reference_wav_path` = the voice's sample.
- `prompt_wav_path` = the same sample.
- `prompt_text` = `(<tone instruction>)` + the sample's transcript. Neutral has no instruction.
- `text` = the sentence.
- `cfg_value` 2.0, `inference_timesteps` 10, float32.

Tone instructions, as used in the approved clips:

| Expression | Instruction |
|---|---|
| Neutral | none |
| Happy | `happy, warm, smiling tone` |
| Sad | `sad, slow, quiet tone` |
| Excited | `excited, cheerful tone` |
| Angry | `angry, forceful tone` |
| Calm | `calm, soft, relaxed tone` |

Only Excited has the owner's approval. Happy, Sad, Angry and Calm were generated and measured (pace and pitch move the right
way, modestly) but the owner has not yet said whether they are distinct enough. Wording may need strengthening after they
listen.

If a voice has its own sample for an expression, that sample and its transcript are the prompt, with no instruction, and the
main sample stays the reference. This is untested.

### Transcript

Continuation mode needs the words spoken in the sample. The app transcribes each sample once, when it is saved, with
faster-whisper (`small.en`, 0.46 GB, part of the first-launch download) and stores the text with the voice. The user does not
type or see it in this version.

### Engine process

The Electron worker that runs Chatterbox is replaced by a helper process: the app's private Python running one script that
loads the model once, then answers requests over stdin/stdout (load, transcribe, generate, cancel) with progress events. The
existing `EngineHost` keeps its interface, so the UI code that calls it does not change. Cancelling stops between generation
steps without unloading the model.

### What ships and what downloads

- In each installer: the app, plus a private Python with PyTorch, VoxCPM and faster-whisper for that chip (Intel: PyTorch
  2.2.2 with the patch; Apple Silicon: current PyTorch using the Mac's GPU). Installers grow from about 130 MB to several
  hundred MB.
- First launch downloads the voice model (4.96 GB) and the transcription model (0.46 GB), resumable as today.

### Screen changes

- **Sliders removed.** Intensity and Variation controlled Chatterbox and have no equivalent here. The composer becomes text,
  expression, Generate.
- **Speed notice on Intel.** Before generating: "On this Mac a sentence takes a few minutes." During: progress per sentence
  with time elapsed and an estimate from the sentences already done.
- **Download screen** shows the new size.
- **Saving a voice** shows "Transcribing your sample…" before it finishes.
- Recorder: one-minute minimum, live coaching, longer script — already built, unchanged.

### Removed

Chatterbox engine code, its tests, `onnxruntime-node`, the Chatterbox model download list, and the Intensity/Variation presets.

### Existing voices

Voices saved before this change have a 30-second sample and no transcript. On first use they are transcribed and work as they
are; the app does not force a re-record. A note on the voice says a one-minute sample would be more accurate.

## Risks

1. **Apple Silicon is untested.** Speed, memory and whether the GPU path gives the same quality are all unknown until someone
   runs it on an M-series Mac.
2. **Memory.** Unmeasured; may rule out 8 GB Macs. Measure early and state a requirement.
3. **A 60-second prompt** is longer than anything the owner heard (48 s) and slower. Measure on Intel; if it is unusable the
   owner decides whether to prompt with less than the full sample.
4. **Tones other than Excited** may be too subtle.
5. **Packaging a private Python** on both chips from an Intel Mac, and ad-hoc signing it, may hit problems.
6. **Transcription errors** in the sample would put wrong words in the prompt and could cause glitches.

## Build order

1. Helper script on this Mac, outside the app: load, transcribe, generate with the recipe, cancel. Check its output against
   the approved clips by ear (owner) before going on.
2. Measure memory and a 60-second prompt on Intel.
3. Wire the helper into `EngineHost`; remove Chatterbox.
4. Voice saving with transcription; existing voices.
5. Composer without sliders; expressions as instructions; Intel speed notice and estimates.
6. First-launch download of both models.
7. Package the private Python for both chips; rebuild both installers; run the Intel one end to end.

## Testing

- Unit tests for the recipe (what is sent for each expression, with and without a per-expression sample) and for the helper
  protocol.
- A real-model test on Intel that generates one sentence and checks it transcribes back to the same words.
- End-to-end run of the packaged Intel app: download, one-minute voice, generate, cancel.
- Apple Silicon: built and checked for architecture only, as before.

## Left to the builder

- Protocol format between the app and the helper.
- How the private Python is assembled and trimmed for each chip.
- How time estimates are computed.
- Whether the prompt is encoded once per voice and reused.
