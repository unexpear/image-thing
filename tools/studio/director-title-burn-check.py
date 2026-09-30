"""Unit tests for Assemble title burn-in helpers (no Comfy server / personal media)."""
import importlib.util
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    'studio_director_finishing',
    ROOT / 'ComfyUI_windows_portable/ComfyUI/custom_nodes/studio_director/finishing.py',
)
finishing = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(finishing)


class TitleBurnTests(unittest.TestCase):
    def test_escape_drawtext(self):
        self.assertEqual(finishing.escape_drawtext("Say 'hi'"), r"Say \'hi\'")
        self.assertEqual(finishing.escape_drawtext('a:b%c\\d'), r'a\:b\%c\\d')
        self.assertEqual(finishing.escape_drawtext('line1\nline2\r\n'), r'line1\nline2\n')

    def test_validate_title_burn(self):
        self.assertIsNone(finishing.validate_title_burn(None))
        ok = finishing.validate_title_burn({
            'text': '  THE SHOW  ',
            'fontSize': 'xl',
            'fontWeight': 'bold',
            'align': 'center',
            'placement': 'title-safe-center',
        })
        self.assertEqual(ok['text'], 'THE SHOW')
        self.assertEqual(ok['fontSize'], 'xl')
        with self.assertRaises(ValueError):
            finishing.validate_title_burn({'text': ''})
        with self.assertRaises(ValueError):
            finishing.validate_title_burn({'text': 'x', 'fontSize': 'huge'})
        with self.assertRaises(ValueError):
            finishing.validate_title_burn({'text': 'x', 'placement': 'center-stage'})
        with self.assertRaises(ValueError):
            finishing.validate_title_burn({'text': 'x' * 501})
        with self.assertRaises(ValueError):
            finishing.validate_title_burn({'text': 'x', 'color': 'red'})

    def test_drawtext_xy_safe_insets(self):
        x, y = finishing.drawtext_xy('title-safe-center', 'center')
        self.assertEqual(x, '(w-text_w)/2')
        self.assertEqual(y, '(h-text_h)/2')
        x, y = finishing.drawtext_xy('lower-third', 'left')
        self.assertIn('0.1', x)
        self.assertIn('text_h', y)
        x, y = finishing.drawtext_xy('action-safe-lower', 'right')
        self.assertIn('0.05', x)

    def test_title_burn_vf_and_append(self):
        burn = finishing.validate_title_burn({
            'text': "Open: 'Night'",
            'fontSize': 'md',
            'fontWeight': 'bold',
            'align': 'center',
            'placement': 'title-safe-lower',
        })
        with tempfile.TemporaryDirectory() as folder:
            textfile = Path(folder) / 'title.txt'
            finishing.write_title_textfile(textfile, burn['text'])
            frag = finishing.title_burn_vf(burn, 1280, 720, textfile)
            self.assertTrue(frag.startswith('drawtext='))
            self.assertIn('textfile=', frag)
            self.assertIn('fontsize=33', frag)  # 720 * 4.6% = 33.12 -> 33
            self.assertIn('fontcolor=0xf4f7ff', frag)
            self.assertIn('x=(w-text_w)/2', frag)
            # No raw colon from Windows drive without escaping when fontfile present
            if 'fontfile=' in frag:
                # path colons must be escaped as \:
                after = frag.split('fontfile=', 1)[1].split(':', 1)[0]
                self.assertNotRegex(after, r'(?<!\\):')

            base = 'scale=1280:720,setsar=1,fps=24,tpad=stop_mode=clone:stop_duration=2'
            out = finishing.append_title_burn_vf(base, burn, 1280, 720, textfile)
            self.assertIn(',drawtext=', out)
            self.assertTrue(out.index('drawtext=') < out.index(',tpad='))
            self.assertIn('fps=24,drawtext=', out.replace(' ', ''))

            # text= mode escaping
            frag2 = finishing.title_burn_vf(burn, 640, 360, textfile=None)
            self.assertIn("text='Open\\: \\'Night\\''", frag2)
            self.assertIn('fontsize=17', frag2)  # 360 * 4.6% = 16.56 -> 17

    def test_font_resolver_docs(self):
        # Resolver may return None on minimal images; must not crash.
        path = finishing.resolve_fontfile(False)
        bold = finishing.resolve_fontfile(True)
        self.assertTrue(path is None or Path(path).is_file())
        self.assertTrue(bold is None or Path(bold).is_file())
        src = (ROOT / 'ComfyUI_windows_portable/ComfyUI/custom_nodes/studio_director/finishing.py').read_text(encoding='utf-8')
        self.assertIn('Font fallback', src)
        self.assertIn('Arial', src)


if __name__ == '__main__':
    unittest.main()
