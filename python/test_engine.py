import json
import os
import subprocess
import sys
import tempfile
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import engine as helper  # noqa: E402


class FakeModel:
    class tts_model:
        sample_rate = 48000

    def __init__(self):
        self.calls = []

    def generate(self, **kwargs):
        self.calls.append(kwargs)
        return np.full(4800, 0.5, dtype=np.float32)


def sample(folder, name, level=0.05, seconds=1):
    path = os.path.join(folder, name)
    (np.sin(np.arange(24000 * seconds) / 9) * level).astype("<f4").tofile(path)
    return path


class EngineTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.events = []
        self.model = FakeModel()
        self.engine = helper.Engine(self.events.append, load_model=lambda d, s: self.model)
        self.engine.handle({"id": 1, "type": "load", "modelDir": "m", "whisperDir": "w"})

    def generate(self, **over):
        request = {"id": 2, "type": "generate", "chunks": ["One.", "Two."], "referencePath": sample(self.tmp, "ref.f32"),
                   "promptPath": sample(self.tmp, "prompt.f32"), "promptText": "(excited, cheerful tone)Hello there.",
                   "outPath": os.path.join(self.tmp, "out.f32")}
        request.update(over)
        self.engine.handle(request)
        return request

    def test_load_reports_loaded(self):
        self.assertEqual(self.events, [{"id": 1, "type": "loaded"}])

    def test_generate_uses_the_approved_recipe(self):
        self.generate()
        self.assertEqual(len(self.model.calls), 2)
        call = self.model.calls[0]
        self.assertEqual(call["text"], "One.")
        self.assertEqual(call["prompt_text"], "(excited, cheerful tone)Hello there.")
        self.assertEqual(call["cfg_value"], 2.0)
        self.assertEqual(call["inference_timesteps"], 10)
        self.assertNotEqual(call["reference_wav_path"], call["prompt_wav_path"])
        self.assertTrue(call["reference_wav_path"].endswith(".wav") and call["prompt_wav_path"].endswith(".wav"))

    def test_generate_reports_progress_then_done_and_writes_audio(self):
        request = self.generate()
        kinds = [(e["type"], e.get("chunk")) for e in self.events[1:]]
        self.assertEqual(kinds, [("progress", 1), ("progress", 2), ("done", None)])
        done = self.events[-1]
        written = np.fromfile(request["outPath"], dtype="<f4")
        self.assertEqual(done["sampleRate"], 48000)
        self.assertEqual(done["samples"], written.size)
        self.assertEqual(written.size, 4800 * 2 + 12000)  # two chunks and a quarter-second gap

    def test_quiet_samples_reach_the_model_at_a_normal_level(self):
        import soundfile
        self.generate()
        audio, rate = soundfile.read(self.model.calls[0]["reference_wav_path"])
        self.assertEqual(rate, 24000)
        self.assertAlmostEqual(float(np.abs(audio).max()), 0.9, places=2)

    def test_failures_are_reported_with_the_request_id(self):
        self.engine.handle({"id": 7, "type": "nonsense"})
        self.assertEqual(self.events[-1]["id"], 7)
        self.assertEqual(self.events[-1]["type"], "error")
        self.generate(id=8, referencePath=os.path.join(self.tmp, "missing.f32"))
        self.assertEqual((self.events[-1]["id"], self.events[-1]["type"]), (8, "error"))

    def test_generate_before_load_is_an_error(self):
        fresh = helper.Engine(self.events.append, load_model=lambda d, s: self.model)
        fresh.handle({"id": 9, "type": "generate", "chunks": ["x"], "referencePath": "a", "promptPath": "b", "promptText": "", "outPath": "c"})
        self.assertEqual((self.events[-1]["id"], self.events[-1]["type"]), (9, "error"))

    def test_transcribe_reports_the_words_of_the_sample(self):
        seen = []
        self.engine._transcriber = lambda whisper_dir, path: seen.append((whisper_dir, path)) or "Hello there."
        path = sample(self.tmp, "t.f32")
        self.engine.handle({"id": 3, "type": "transcribe", "samplePath": path})
        self.assertEqual(self.events[-1], {"id": 3, "type": "transcript", "text": "Hello there."})
        self.assertEqual(seen, [("w", path)])

    def test_transcription_joins_what_whisper_hears(self):
        class Segment:
            def __init__(self, text): self.text = text

        class Whisper:
            def transcribe(self, audio, **kwargs):
                assert abs(len(audio) - 16000) < 10, len(audio)
                assert abs(float(abs(audio).max()) - 0.9) < 0.02  # a quiet sample is raised first
                return [Segment(" Hello there. "), Segment("How are you?")], None

        text = helper.transcribe_sample("w", sample(self.tmp, "t.f32"), load=lambda d: Whisper())
        self.assertEqual(text, "Hello there. How are you?")

    def test_a_failed_transcription_is_reported(self):
        def broken(whisper_dir, path):
            raise RuntimeError("The sample could not be transcribed.")
        self.engine._transcriber = broken
        self.engine.handle({"id": 4, "type": "transcribe", "samplePath": "x"})
        self.assertEqual(self.events[-1], {"id": 4, "type": "error", "message": "The sample could not be transcribed."})

    def test_float32_view_changes_only_the_number_format(self):
        model_dir = os.path.join(self.tmp, "model")
        os.makedirs(model_dir)
        with open(os.path.join(model_dir, "config.json"), "w") as f:
            json.dump({"dtype": "bfloat16", "other": 1}, f)
        open(os.path.join(model_dir, "model.safetensors"), "w").close()
        view = helper.float32_model_dir(model_dir, self.tmp)
        with open(os.path.join(view, "config.json")) as f:
            self.assertEqual(json.load(f), {"dtype": "float32", "other": 1})
        self.assertTrue(os.path.islink(os.path.join(view, "model.safetensors")))

    def test_the_graphics_chip_is_used_only_on_apple_silicon(self):
        self.assertEqual(helper.pick_device("arm64", True), "mps")
        self.assertEqual(helper.pick_device("arm64", False), "cpu")
        # Intel Macs report a usable graphics chip, but it has too little memory for the model.
        self.assertEqual(helper.pick_device("x86_64", True), "cpu")

    def test_wav_becomes_a_playable_mp3_of_the_same_length(self):
        import av
        import soundfile
        src = os.path.join(self.tmp, "clip.wav")
        dst = os.path.join(self.tmp, "clip.mp3")
        soundfile.write(src, (np.sin(np.arange(48000 * 2) / 20) * 0.5).astype(np.float32), 48000, subtype="PCM_16")
        helper.wav_to_mp3(src, dst)
        with av.open(dst) as container:
            stream = container.streams.audio[0]
            self.assertIn(stream.codec_context.name, ("mp3", "mp3float"))
            self.assertEqual(stream.codec_context.sample_rate, 48000)
            self.assertAlmostEqual(float(container.duration) / av.time_base, 2.0, delta=0.15)
        self.assertGreater(os.path.getsize(dst), 10000)

    def test_stdout_carries_only_events(self):
        script = os.path.join(os.path.dirname(__file__), "engine.py")
        out = subprocess.run([sys.executable, script], input='{"id":1,"type":"nonsense"}\nnot json\n', capture_output=True, text=True, timeout=60)
        lines = [json.loads(line) for line in out.stdout.splitlines()]
        self.assertEqual([e["type"] for e in lines], ["error", "error"])
        self.assertEqual(lines[0]["id"], 1)


if __name__ == "__main__":
    unittest.main()
