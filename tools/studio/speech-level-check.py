"""Check that generated speech is brought to a usable level, in both directions.

Kokoro writes about ten decibels too quiet and Chatterbox writes hot enough to
clip, so the level pass has to correct either one without touching a take that
is already right.
"""
import importlib.util
import math
import struct
import tempfile
import unittest
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('assistant_worker', ROOT / 'tools/studio/assistant-worker.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


def tone(path, peak_dbfs, sampwidth=2, frames=2400):
    """A short sine at an exact peak level."""
    amplitude = int(32767 * (10 ** (peak_dbfs / 20)))
    samples = [int(amplitude * math.sin(2 * math.pi * 440 * n / 24000)) for n in range(frames)]
    # Guarantee the stated peak is actually reached.
    samples[0] = amplitude
    with wave.open(str(path), 'wb') as out:
        out.setnchannels(1)
        out.setsampwidth(sampwidth)
        out.setframerate(24000)
        out.writeframes(b''.join(struct.pack('<h', s) for s in samples))


def peak_dbfs(path):
    with wave.open(str(path), 'rb') as source:
        frames = source.readframes(source.getnframes())
    peak = max(abs(v) for (v,) in struct.iter_unpack('<h', frames))
    return 20 * math.log10(peak / 32767)


class LevelChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.folder = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def test_quiet_take_is_lifted(self):
        path = self.folder / 'quiet.wav'
        tone(path, -20)
        gain = worker.normalize(str(path))
        self.assertAlmostEqual(gain, 17.0, delta=0.6)
        self.assertAlmostEqual(peak_dbfs(path), -3.0, delta=0.3)

    def test_hot_take_is_pulled_down(self):
        path = self.folder / 'hot.wav'
        tone(path, -0.1)          # Chatterbox lands here and clips.
        gain = worker.normalize(str(path))
        self.assertLess(gain, 0)
        self.assertAlmostEqual(peak_dbfs(path), -3.0, delta=0.3)

    def test_take_already_at_target_is_left_alone(self):
        path = self.folder / 'fine.wav'
        tone(path, -3.0)
        before = path.read_bytes()
        self.assertIsNone(worker.normalize(str(path)))
        self.assertEqual(path.read_bytes(), before)

    def test_silence_and_unsupported_widths_are_skipped(self):
        silent = self.folder / 'silent.wav'
        with wave.open(str(silent), 'wb') as out:
            out.setnchannels(1); out.setsampwidth(2); out.setframerate(24000)
            out.writeframes(b'\x00\x00' * 240)
        self.assertIsNone(worker.normalize(str(silent)))

        wide = self.folder / 'wide.wav'
        with wave.open(str(wide), 'wb') as out:
            out.setnchannels(1); out.setsampwidth(4); out.setframerate(24000)
            out.writeframes(b'\x00\x00\x00\x00' * 240)
        self.assertIsNone(worker.normalize(str(wide)))

    def test_both_engines_are_routed_to_their_own_runtime(self):
        self.assertEqual(set(worker.ENGINES), {'kokoro', 'chatterbox'})
        for engine, (runtime, script, stage) in worker.ENGINES.items():
            self.assertTrue(runtime.endswith('python.exe'), runtime)
            self.assertIn(engine, script.lower())
            self.assertTrue(stage.strip())


unittest.main()
