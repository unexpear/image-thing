"""Unit checks for soft-mux captions language (no media / no Comfy server)."""
import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
path = ROOT / "ComfyUI_windows_portable/ComfyUI/custom_nodes/studio_director/finishing.py"
spec = importlib.util.spec_from_file_location("studio_director_finishing", path)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

assert mod.validate_captions_language(None) == "eng"
assert mod.validate_captions_language("") == "eng"
assert mod.validate_captions_language("SPA") == "spa"
assert mod.validate_captions_language("jpn") == "jpn"
try:
    mod.validate_captions_language("en")
    raise SystemExit("expected short code reject")
except ValueError as e:
    assert "3-letter" in str(e)
try:
    mod.validate_captions_language("zzz")
    raise SystemExit("expected unsupported reject")
except ValueError as e:
    assert "Unsupported" in str(e)
try:
    mod.validate_captions_language(12)
    raise SystemExit("expected type reject")
except ValueError as e:
    assert "text" in str(e)

args = mod.soft_mux_mov_text_args("ffmpeg", "v.mp4", "c.srt", "out.mp4")
assert "language=eng" in args
args = mod.soft_mux_mov_text_args("ffmpeg", "v.mp4", "c.srt", "out.mp4", "fra")
assert "language=fra" in args
assert args[args.index("-metadata:s:s:0") + 1] == "language=fra"
# After-export remux reuses the same ffmpeg args (A/V copy + mov_text); language metadata still required.
args = mod.soft_mux_mov_text_args("ffmpeg", "episode.mp4", "c.srt", "episode-captioned.mp4", "deu")
assert args.count("-c:v") == 1 and "copy" in args
assert args[args.index("-c:s") + 1] == "mov_text"
assert "language=deu" in args
print("Soft-mux captions language checks passed (incl. after-export args reuse).")
