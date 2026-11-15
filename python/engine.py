"""Open Clone voice engine helper.

Runs inside the app's private Python. Reads one JSON request per line on stdin and
writes one JSON event per line on stdout; everything else goes to stderr.

Requests:  load {modelDir, whisperDir} | transcribe {samplePath}
           generate {chunks, referencePath, promptPath, promptText, outPath}
Events:    loaded | transcript {text} | progress {chunk, of} | done {sampleRate, samples}
           error {message}

There is no cancel request: the app stops a job by ending this process.
"""
import json
import os
import sys
import tempfile

SAMPLE_RATE = 24000          # voice samples on disk: raw float32 mono
TARGET_PEAK = 0.9
CHUNK_GAP_SEC = 0.25
CFG_VALUE = 2.0              # the settings the owner's approved clips were made with
INFERENCE_TIMESTEPS = 10


def patch_attention(torch):
    """PyTorch before 2.5 has no grouped-query option: expand the shared key/value heads by hand."""
    major, minor = (int(p) for p in torch.__version__.split(".")[:2])
    if (major, minor) >= (2, 5):
        return
    functional = torch.nn.functional
    original = functional.scaled_dot_product_attention

    def attention(query, key, value, *args, enable_gqa=False, **kwargs):
        if enable_gqa and key.shape[-3] != query.shape[-3]:
            repeat = query.shape[-3] // key.shape[-3]
            key = key.repeat_interleave(repeat, dim=-3)
            value = value.repeat_interleave(repeat, dim=-3)
        return original(query, key, value, *args, **kwargs)

    functional.scaled_dot_product_attention = attention


def float32_model_dir(model_dir, scratch):
    """A view of the model folder whose config asks for float32, which is what CPUs run well."""
    with open(os.path.join(model_dir, "config.json")) as f:
        config = json.load(f)
    if config.get("dtype") == "float32":
        return model_dir
    view = os.path.join(scratch, "model-float32")
    os.makedirs(view, exist_ok=True)
    for name in os.listdir(model_dir):
        link = os.path.join(view, name)
        if os.path.lexists(link):
            os.remove(link)
        if name != "config.json":
            os.symlink(os.path.join(model_dir, name), link)
    config["dtype"] = "float32"
    with open(os.path.join(view, "config.json"), "w") as f:
        json.dump(config, f)
    return view


def load_voxcpm(model_dir, scratch):
    import torch
    patch_attention(torch)
    from voxcpm import VoxCPM
    on_gpu = torch.backends.mps.is_available()
    path = model_dir if on_gpu else float32_model_dir(model_dir, scratch)
    return VoxCPM.from_pretrained(path, load_denoiser=False, optimize=False, device="mps" if on_gpu else "cpu")


def load_whisper(whisper_dir):
    from faster_whisper import WhisperModel
    return WhisperModel(whisper_dir, device="cpu", compute_type="int8")


class Engine:
    def __init__(self, emit, load_model=load_voxcpm, load_transcriber=load_whisper):
        self.emit = emit
        self._load_model = load_model
        self._load_transcriber = load_transcriber
        self.model = None
        self.transcriber = None
        self.whisper_dir = None
        self.scratch = tempfile.mkdtemp(prefix="openclone-engine-")
        self._wavs = {}

    def handle(self, request):
        rid = request.get("id")
        try:
            kind = request.get("type")
            if kind == "load":
                self.load(rid, request)
            elif kind == "transcribe":
                self.transcribe(rid, request)
            elif kind == "generate":
                self.generate(rid, request)
            else:
                raise ValueError(f"Unknown request: {kind}")
        except Exception as err:  # every failure is reported, never fatal
            self.emit({"id": rid, "type": "error", "message": str(err) or err.__class__.__name__})

    def load(self, rid, request):
        self.whisper_dir = request["whisperDir"]
        if self.model is None:
            self.model = self._load_model(request["modelDir"], self.scratch)
        self.emit({"id": rid, "type": "loaded"})

    def read_sample(self, path):
        import numpy as np
        audio = np.fromfile(path, dtype="<f4")
        if audio.size == 0:
            raise ValueError("The voice sample is empty.")
        peak = float(np.abs(audio).max())
        return audio * (TARGET_PEAK / peak) if peak > 0 else audio

    def sample_wav(self, path):
        """The sample as a WAV file at a normal level, which is what the model reads."""
        import soundfile
        key = (path, os.path.getmtime(path))
        if key not in self._wavs:
            out = os.path.join(self.scratch, f"sample-{len(self._wavs)}.wav")
            soundfile.write(out, self.read_sample(path), SAMPLE_RATE)
            self._wavs[key] = out
        return self._wavs[key]

    def transcribe(self, rid, request):
        import numpy as np
        if self.transcriber is None:
            self.transcriber = self._load_transcriber(self.whisper_dir)
        audio = self.read_sample(request["samplePath"])
        # Whisper listens at 16 kHz.
        at16k = np.interp(np.arange(0, audio.size, SAMPLE_RATE / 16000), np.arange(audio.size), audio).astype(np.float32)
        segments, _ = self.transcriber.transcribe(at16k, language="en", beam_size=5)
        text = " ".join(s.text.strip() for s in segments).strip()
        self.emit({"id": rid, "type": "transcript", "text": text})

    def generate(self, rid, request):
        import numpy as np
        if self.model is None:
            raise RuntimeError("The voice model is not loaded.")
        chunks = request["chunks"]
        reference = self.sample_wav(request["referencePath"])
        prompt = self.sample_wav(request["promptPath"])
        rate = int(self.model.tts_model.sample_rate)
        gap = np.zeros(int(rate * CHUNK_GAP_SEC), dtype=np.float32)
        pieces = []
        for i, chunk in enumerate(chunks):
            self.emit({"id": rid, "type": "progress", "chunk": i + 1, "of": len(chunks)})
            wav = self.model.generate(
                text=chunk,
                reference_wav_path=reference,
                prompt_wav_path=prompt,
                prompt_text=request["promptText"],
                cfg_value=CFG_VALUE,
                inference_timesteps=INFERENCE_TIMESTEPS,
            )
            if pieces:
                pieces.append(gap)
            pieces.append(np.asarray(wav, dtype=np.float32).reshape(-1))
        audio = np.concatenate(pieces) if pieces else np.zeros(0, dtype=np.float32)
        audio.astype("<f4").tofile(request["outPath"])
        self.emit({"id": rid, "type": "done", "sampleRate": rate, "samples": int(audio.size)})


def main():
    # Libraries print to stdout; keep the real one for events only.
    events = os.fdopen(os.dup(sys.stdout.fileno()), "w", buffering=1)
    os.dup2(sys.stderr.fileno(), sys.stdout.fileno())
    sys.stdout = sys.stderr

    def emit(event):
        events.write(json.dumps(event) + "\n")
        events.flush()

    engine = Engine(emit)
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except ValueError:
            emit({"id": None, "type": "error", "message": "Unreadable request."})
            continue
        engine.handle(request)


if __name__ == "__main__":
    main()
