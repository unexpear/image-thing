import asyncio
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

ROOT = Path(__file__).resolve().parents[2]


class AssistantChecks(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.folder = Path(self.temp.name)
        sys.modules['folder_paths'] = types.SimpleNamespace(get_input_directory=lambda: str(self.folder))
        comfy = types.ModuleType('comfy'); memory = types.ModuleType('comfy.model_management')
        comfy.model_management = memory
        sys.modules['comfy'] = comfy; sys.modules['comfy.model_management'] = memory
        app = web.Application(); routes = web.RouteTableDef()
        self.server = types.SimpleNamespace(app=app, routes=routes, prompt_queue=types.SimpleNamespace(get_current_queue=lambda: [[], []]))
        sys.modules['server'] = types.SimpleNamespace(PromptServer=types.SimpleNamespace(instance=self.server))
        spec = importlib.util.spec_from_file_location('assistant_test', ROOT/'ComfyUI_windows_portable/ComfyUI/custom_nodes/studio_assistant/__init__.py')
        self.mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(self.mod)
        app.add_routes(routes)
        app.router.add_post('/prompt', lambda r: web.json_response({'accepted': True}))
        self.client = TestClient(TestServer(app)); await self.client.start_server()

    async def asyncTearDown(self):
        self.mod.active = None
        await self.client.close(); self.temp.cleanup()

    async def test_validation(self):
        for body in [None, {}, {'kind':'write','text':'x','model':'arbitrary'}, {'kind':'shot','text':'x'*1501}, {'kind':'transcribe','audio':{'type':'input','name':'../outside.wav'}}]:
            with self.assertRaises(ValueError): self.mod.prepare(body)
        (self.folder/'test.wav').write_bytes(b'RIFF')
        self.assertEqual(self.mod.prepare({'kind':'transcribe','audio':{'type':'input','name':'test.wav'}})['model'], 'r2t2')
        self.assertEqual(self.mod.prepare({'kind':'shot','text':'Mira waves for 6 seconds in a room'})['model'],'bonsai')

    async def test_voice_validation(self):
        for body in [{'kind':'voice','text':''}, {'kind':'voice','text':'Hello','voice':'../arbitrary'}, {'kind':'voice','text':'Hello','speed':float('nan')}, {'kind':'voice','text':'Hello','speed':True}]:
            with self.assertRaises(ValueError): self.mod.prepare(body)
        with self.assertRaises(ValueError): self.mod.prepare({'kind':'voice','text':'a'*1001})
        self.assertEqual(self.mod.prepare({'kind':'voice','text':'a'*1000,'voice':'bm_george'})['model'],'kokoro')
        result=self.mod.prepare({'kind':'voice','text':'Hello','voice':'bm_george','speed':.9})
        self.assertEqual(result['model'],'kokoro')
        self.assertTrue(Path(result['output']).is_relative_to(self.folder))
        self.assertEqual(result['audio']['type'],'input')

    async def test_animation_stages(self):
        plan = self.mod.prepare({'kind':'write','model':'bonsai','skill':'animation','stage':'plan','text':'Time a wave.'})
        self.assertNotIn('almond', plan['prompt'])
        self.assertNotIn('0.2 to 4', plan['prompt'])
        self.assertIn('Bunch positions', plan['prompt'])
        self.assertTrue(plan['prompt'].endswith('REQUEST:\nTime a wave.'))
        self.assertEqual(plan['max_tokens'], 512)
        face = self.mod.prepare({'kind':'write','model':'bonsai','skill':'animation','stage':'face','text':'A look.'})
        self.assertIn('almond', face['prompt'])
        self.assertNotIn('Bunch positions', face['prompt'])
        self.assertEqual(face['max_tokens'], 512)
        done = self.mod.prepare({'kind':'write','model':'bonsai','skill':'animation','stage':'face','finished':['face'],'text':'A look.'})
        self.assertNotIn('almond', done['prompt'])
        self.assertIn('finished', done['prompt'])
        with self.assertRaises(ValueError):
            self.mod.prepare({'kind':'write','skill':'animation','stage':'rig','text':'x'})
        shot = self.mod.prepare({'kind':'shot','text':'Mira waves for 6 seconds in a room'})
        self.assertIn('duration_seconds', shot['prompt'])
        self.assertNotIn('almond', shot['prompt'])
        self.assertEqual(shot['max_tokens'], 512)

    async def test_asset_guide(self):
        result = self.mod.prepare({'kind':'write','model':'bonsai','skill':'asset','text':'A hinged cartoon lunchbox.'})
        self.assertEqual(result['model'], 'bonsai')
        self.assertIn('text only', result['prompt'])
        self.assertIn('pivots', result['prompt'])
        self.assertTrue(result['prompt'].endswith('REQUEST:\nA hinged cartoon lunchbox.'))
        with self.assertRaises(ValueError):
            self.mod.prepare({'kind':'write','skill':'../asset','text':'x'})

    async def test_results(self):
        self.assertEqual(self.mod.normalize('transcribe', {'text':': Hello world.\nPeak GPU memory: 3.84 GiB'})['text'],'Hello world.')
        self.assertTrue(self.mod.normalize('write', {'text':'A draft','finish_reason':'length'})['truncated'])
        with self.assertRaises(ValueError): self.mod.normalize('write', {'text':''})
        with self.assertRaises(ValueError): self.mod.normalize('shot', {'text':json.dumps({'function_calls':[]})})
        with self.assertRaises(ValueError): self.mod.normalize('shot', {'text':'[]'})
        with self.assertRaises(ValueError): self.mod.normalize('shot', {'text':'not json'})
        with self.assertRaises(ValueError): self.mod.prepare({'kind':'write','text':'x','skill':'../../file'})
        shot={'character':'Mira','setting':'Room','action':'Waves','duration_seconds':6}
        self.assertEqual(self.mod.normalize('shot', {'text':json.dumps(shot)})['shot'],shot)
        self.assertEqual(self.mod.normalize('shot', {'text':json.dumps({'function_calls':[{'name':'propose_shot','arguments':shot}]})})['shot'],shot)

    async def test_exclusion_and_cancel(self):
        self.mod.active='test'; self.mod.jobs['test']={'model':'bonsai','state':'running'}
        response=await self.client.post('/prompt',json={}); self.assertEqual(response.status,409)
        response=await self.client.post('/studio/assistant/test/cancel',json={}); self.assertEqual(response.status,403)
        response=await self.client.post('/studio/assistant/test/cancel',json={},headers={'X-Studio-Director':'1'}); self.assertEqual(response.status,200)
        self.assertEqual(self.mod.jobs['test']['state'],'cancelling')
        self.mod.active=None
        self.server.prompt_queue.get_current_queue=lambda: [[{'id':'busy'}],[]]
        response=await self.client.post('/studio/assistant',json={'kind':'write','text':'hello'},headers={'X-Studio-Director':'1'}); self.assertEqual(response.status,409)
        response=await self.client.get('/studio/assistant/missing'); self.assertEqual(response.status,404)

    async def test_speech_engines(self):
        # Kokoro keeps its voice and speed; Chatterbox takes delivery and pacing instead.
        (self.folder/'bm_george.pt').write_bytes(b'')
        self.mod.VOICES = self.folder
        kokoro = self.mod.prepare({'kind':'voice','text':'Hello','engine':'kokoro','voice':'bm_george'})
        self.assertEqual(kokoro['model'],'kokoro')
        self.assertEqual(kokoro['voice'],'bm_george')
        self.assertNotIn('exaggeration',kokoro)
        self.assertTrue(kokoro['audio']['name'].startswith('kokoro-'))

        self.mod.CHATTERBOX = self.folder/'run_chatterbox.py'
        self.mod.CHATTERBOX.write_text('', encoding='utf-8')
        acted = self.mod.prepare({'kind':'voice','text':'Hello','engine':'chatterbox','delivery':0.9,'pacing':0.3})
        self.assertEqual(acted['model'],'chatterbox')
        self.assertEqual((acted['exaggeration'],acted['cfg_weight']),(0.9,0.3))
        self.assertNotIn('voice',acted)
        self.assertTrue(acted['audio']['name'].startswith('chatterbox-'))

        for body in [{'engine':'nope'},{'engine':'chatterbox','delivery':1.6},{'engine':'chatterbox','delivery':-0.1},
                     {'engine':'chatterbox','pacing':0},{'engine':'chatterbox','pacing':1.1},
                     {'engine':'chatterbox','delivery':True}]:
            with self.assertRaises(ValueError): self.mod.prepare({'kind':'voice','text':'Hello',**body})

        # A missing runtime is reported rather than failing later in the worker.
        self.mod.CHATTERBOX.unlink()
        with self.assertRaises(ValueError): self.mod.prepare({'kind':'voice','text':'Hello','engine':'chatterbox'})

    async def test_reference_voice(self):
        self.mod.CHATTERBOX = self.folder/'run_chatterbox.py'
        self.mod.CHATTERBOX.write_text('', encoding='utf-8')
        (self.folder/'sample.wav').write_bytes(b'RIFF')
        acted = self.mod.prepare({'kind':'voice','text':'Hello','engine':'chatterbox',
                                  'reference':{'type':'input','name':'sample.wav'}})
        self.assertTrue(Path(acted['reference']).is_relative_to(self.folder))
        # The reference cannot be used to read outside the input folder, or to
        # pass a file that is not audio.
        (self.folder/'notes.txt').write_bytes(b'x')
        for item in [{'type':'input','name':'../outside.wav'}, {'type':'output','name':'sample.wav'},
                     {'type':'input','name':'missing.wav'}, {'type':'input','name':'notes.txt'}, 'not-a-dict']:
            with self.assertRaises(ValueError):
                self.mod.prepare({'kind':'voice','text':'Hello','engine':'chatterbox','reference':item})

    async def test_voice_listing(self):
        # The menu is built from this listing, so it must match what prepare() accepts.
        for name in ('am_adam.pt','bm_george.pt','ax_weird.pt','cf_other.pt','notes.txt'):
            (self.folder/name).write_bytes(b'')
        self.mod.VOICES=self.folder
        response=await self.client.get('/studio/assistant/voices')
        self.assertEqual(response.status,200)
        listed=await response.json()
        self.assertEqual([v['id'] for v in listed['voices']],['am_adam','bm_george'])
        self.assertEqual(listed['voices'][0]['name'],'Adam')
        self.assertEqual(listed['voices'][1]['accent'],'British male')
        self.assertEqual(listed['default'],'bm_george')
        self.assertEqual(self.mod.prepare({'kind':'voice','text':'Hello','voice':'am_adam'})['voice'],'am_adam')
        with self.assertRaises(ValueError): self.mod.prepare({'kind':'voice','text':'Hello','voice':'ax_weird'})

    async def test_voice_cleanup(self):
        folder = self.folder/'studio-voices'
        folder.mkdir()
        for name in ('keep.wav','drop.wav','other.wav'):
            (folder/name).write_bytes(b'RIFF' + b'0'*100)
        (folder/'notes.txt').write_bytes(b'not a take')

        response = await self.client.post('/studio/voices/cleanup', json={'keep':['keep.wav']})
        self.assertEqual(response.status, 403)          # Needs the Director header.
        D = {'X-Studio-Director':'1'}
        for body in [{}, {'keep':'keep.wav'}, {'keep':[1]}]:
            response = await self.client.post('/studio/voices/cleanup', json=body, headers=D)
            self.assertEqual(response.status, 400)
        # Nothing was removed by any of the rejected calls.
        self.assertEqual(sorted(p.name for p in folder.iterdir()),
                         ['drop.wav','keep.wav','notes.txt','other.wav'])

        response = await self.client.post('/studio/voices/cleanup', json={'keep':['keep.wav']}, headers=D)
        self.assertEqual(response.status, 200)
        result = await response.json()
        self.assertEqual((result['deleted'], result['kept'], result['failed']), (2, 1, 0))
        self.assertGreater(result['freed'], 0)
        # The take in use survives, and a non-take file is never touched.
        self.assertEqual(sorted(p.name for p in folder.iterdir()), ['keep.wav','notes.txt'])

    async def test_voice_cleanup_waits_for_a_running_job(self):
        (self.folder/'studio-voices').mkdir()
        (self.folder/'studio-voices'/'inflight.wav').write_bytes(b'RIFF')
        self.mod.active = 'busy'
        self.mod.jobs['busy'] = {'model':'chatterbox','state':'running'}
        response = await self.client.post('/studio/voices/cleanup', json={'keep':[]},
                                          headers={'X-Studio-Director':'1'})
        self.assertEqual(response.status, 409)
        # A take being written right now must still be there.
        self.assertTrue((self.folder/'studio-voices'/'inflight.wav').is_file())


    async def test_voice_orphan_list_and_discard(self):
        folder = self.folder/'studio-voices'
        folder.mkdir()
        (folder/'keep.wav').write_bytes(b'RIFF' + b'0'*40)
        (folder/'orphan.wav').write_bytes(b'RIFF' + b'0'*80)
        (folder/'notes.txt').write_bytes(b'ignore')
        D = {'X-Studio-Director': '1'}

        response = await self.client.get('/studio/voices/files')
        self.assertEqual(response.status, 403)
        response = await self.client.get('/studio/voices/files', headers=D)
        self.assertEqual(response.status, 200)
        listed = await response.json()
        self.assertEqual(sorted(f['name'] for f in listed['files']), ['keep.wav', 'orphan.wav'])
        self.assertEqual(listed['folder'], 'studio-voices')
        for f in listed['files']:
            self.assertEqual(f['subfolder'], 'studio-voices')
            self.assertEqual(f['type'], 'input')
            self.assertGreater(f['bytes'], 0)
            self.assertIn('mtime', f)

        response = await self.client.post('/studio/voices/discard', json={'names': ['orphan.wav']})
        self.assertEqual(response.status, 403)
        for body in [{}, {'names': 'orphan.wav'}, {'names': ['../x.wav']}, {'names': ['notes.txt']}, {'names': []}]:
            response = await self.client.post('/studio/voices/discard', json=body, headers=D)
            self.assertEqual(response.status, 400)
        self.assertTrue((folder/'orphan.wav').is_file())

        response = await self.client.post('/studio/voices/discard', json={'names': ['orphan.wav']}, headers=D)
        self.assertEqual(response.status, 200)
        result = await response.json()
        self.assertEqual(result['deleted'], 1)
        self.assertGreater(result['freed'], 0)
        self.assertEqual(result['protected'], 0)
        self.assertFalse((folder/'orphan.wav').exists())
        self.assertTrue((folder/'keep.wav').is_file())
        self.assertTrue((folder/'notes.txt').is_file())

        # Missing is a no-op success shape
        response = await self.client.post('/studio/voices/discard', json={'names': ['orphan.wav']}, headers=D)
        self.assertEqual(response.status, 200)
        again = await response.json()
        self.assertEqual(again['deleted'], 0)
        self.assertEqual(again['missing'], 1)

        # Busy assistant blocks discard
        (folder/'busy.wav').write_bytes(b'RIFF')
        self.mod.active = 'busy'
        self.mod.jobs['busy'] = {'model': 'kokoro', 'state': 'running'}
        response = await self.client.post('/studio/voices/discard', json={'names': ['busy.wav']}, headers=D)
        self.assertEqual(response.status, 409)
        self.assertTrue((folder/'busy.wav').is_file())
        self.mod.active = None

    async def test_voice_orphan_multi_discard(self):
        """Batch discard is per-file fail-safe: free orphans delete; snapshot refs stay."""
        folder = self.folder / 'studio-voices'
        folder.mkdir()
        (folder / 'free-a.wav').write_bytes(b'RIFF' + b'0' * 40)
        (folder / 'free-b.wav').write_bytes(b'RIFF' + b'0' * 60)
        (folder / 'snap-keep.wav').write_bytes(b'RIFF' + b'0' * 80)
        (folder / 'gone-already.wav')  # not created — missing path
        D = {'X-Studio-Director': '1'}

        # >64 names rejected
        too_many = [f'n{i}.wav' for i in range(65)]
        response = await self.client.post('/studio/voices/discard', json={'names': too_many}, headers=D)
        self.assertEqual(response.status, 400)
        self.assertTrue((folder / 'free-a.wav').is_file())

        # Plant a disk snapshot under a temp ROOT so snap-keep is protected
        snap_root = self.folder / 'snap-root'
        proj = snap_root / 'studio-data' / 'director-projects' / 'ep-other'
        proj.mkdir(parents=True)
        (proj / 'project.json').write_text(json.dumps({
            'voiceTakes': [{
                'audio': {'name': 'snap-keep.wav', 'subfolder': 'studio-voices', 'type': 'input'},
            }],
        }), encoding='utf-8')
        real_root = self.mod.ROOT
        self.mod.ROOT = snap_root
        try:
            response = await self.client.post(
                '/studio/voices/discard',
                json={'names': ['free-a.wav', 'free-b.wav', 'snap-keep.wav', 'gone-already.wav']},
                headers=D,
            )
            self.assertEqual(response.status, 200)
            result = await response.json()
            self.assertEqual(result['deleted'], 2)
            self.assertEqual(result['protected'], 1)
            self.assertEqual(result['missing'], 1)
            self.assertEqual(result['failed'], 0)
            self.assertGreater(result['freed'], 0)
            self.assertFalse((folder / 'free-a.wav').exists())
            self.assertFalse((folder / 'free-b.wav').exists())
            self.assertTrue((folder / 'snap-keep.wav').is_file())
        finally:
            self.mod.ROOT = real_root

        # Busy still blocks the whole batch
        (folder / 'batch-busy.wav').write_bytes(b'RIFF')
        self.mod.active = 'busy'
        self.mod.jobs['busy'] = {'model': 'kokoro', 'state': 'running'}
        response = await self.client.post(
            '/studio/voices/discard',
            json={'names': ['batch-busy.wav', 'snap-keep.wav']},
            headers=D,
        )
        self.assertEqual(response.status, 409)
        self.assertTrue((folder / 'batch-busy.wav').is_file())
        self.mod.active = None

    async def test_cpu_helpers_share_the_backend(self):

        # Kokoro runs on the CPU, so Studio generation keeps working while it
        # speaks -- but clearing media must stay blocked, because it would
        # delete the WAV the voice job is still writing.
        self.mod.active='voice'; self.mod.jobs['voice']={'model':'kokoro','state':'running'}
        response=await self.client.post('/prompt',json={}); self.assertEqual(response.status,200)
        response=await self.client.post('/studio/clear-media',json={}); self.assertEqual(response.status,409)
        self.mod.active=None
        # A busy Studio queue must not hold up a CPU helper either.
        started=[]
        async def noop(job, request): started.append(request['model'])
        self.mod.run=noop
        self.server.prompt_queue.get_current_queue=lambda: [[{'id':'busy'}],[]]
        response=await self.client.post('/studio/assistant',json={'kind':'voice','text':'Hello','voice':'bm_george'},headers={'X-Studio-Director':'1'})
        self.assertEqual(response.status,200)
        await asyncio.sleep(0)
        self.assertEqual(started,['kokoro'])


unittest.main()
