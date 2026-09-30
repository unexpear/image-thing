"""Exercise local recording upload transactions using synthetic bytes only."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
import asyncio
import io
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('recording_upload_test', ROOT / 'ComfyUI_windows_portable/ComfyUI/custom_nodes/studio_director/recording_upload.py')

class UploadChecks(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        sys.modules['folder_paths'] = types.SimpleNamespace(get_temp_directory=lambda: str(self.root / 'temp'), get_input_directory=lambda: str(self.root / 'input'))
        self.module = importlib.util.module_from_spec(SPEC)
        SPEC.loader.exec_module(self.module)
        app = web.Application(client_max_size=100*1024*1024)
        routes = web.RouteTableDef()
        self.module.register(routes)
        app.add_routes(routes)
        self.client = TestClient(TestServer(app))
        await self.client.start_server()
        self.headers = {'X-Studio-Director':'1'}

    async def asyncTearDown(self):
        await self.client.close()
        self.temp.cleanup()

    async def begin(self, size):
        response = await self.client.post('/studio/director/recordings', headers=self.headers, json={'size':size})
        self.assertEqual(response.status,200,await response.text())
        return (await response.json())['id']

    async def test_boundaries_and_cancel(self):
        response = await self.client.post('/studio/director/recordings',json={'size':10})
        self.assertEqual(response.status,403)
        key = await self.begin(10)
        url = '/studio/director/recordings/'+key
        response = await self.client.put(url,headers={**self.headers,'X-Recording-Offset':'2'},data=b'ab')
        self.assertEqual(response.status,409)
        response = await self.client.put(url,headers={**self.headers,'X-Recording-Offset':'0'},data=b'x'*11)
        self.assertEqual(response.status,400)
        self.assertEqual(self.module.sessions[key]['path'].stat().st_size,0)
        response = await self.client.post(url+'/finish',headers=self.headers)
        self.assertEqual(response.status,400)
        response = await self.client.delete(url,headers=self.headers)
        self.assertEqual(response.status,200)
        self.assertNotIn(key,self.module.sessions)

    async def test_larger_than_normal_upload_limit(self):
        size = 110*1024*1024
        key = await self.begin(size)
        url = '/studio/director/recordings/'+key
        offset = 0
        while offset < size:
            chunk = b'\0'*min(self.module.CHUNK_BYTES,size-offset)
            if not offset: chunk = b'\x1a\x45\xdf\xa3'+chunk[4:]
            response = await self.client.put(url,headers={**self.headers,'X-Recording-Offset':str(offset)},data=io.BytesIO(chunk))
            self.assertEqual(response.status,200,await response.text())
            offset += len(chunk)
            self.assertEqual((await response.json())['offset'],offset)
        response = await self.client.post(url+'/finish',headers=self.headers)
        self.assertEqual(response.status,200,await response.text())
        result = await response.json()
        self.assertEqual((self.root/'input'/result['subfolder']/result['name']).stat().st_size,size)
        self.assertNotIn(key,self.module.sessions)

    async def test_cancel_during_chunk(self):
        key=await self.begin(10)
        release=asyncio.Event()
        async def content():
            yield b'1234'
            await release.wait()
            yield b'567890'
        url='/studio/director/recordings/'+key
        pending=asyncio.create_task(self.client.put(url,headers={**self.headers,'X-Recording-Offset':'0'},data=content()))
        for _ in range(100):
            if self.module.sessions[key]['busy']:break
            await asyncio.sleep(.01)
        response=await self.client.delete(url,headers=self.headers)
        self.assertEqual(response.status,200)
        release.set()
        response=await pending
        self.assertEqual(response.status,409)
        self.assertNotIn(key,self.module.sessions)
        self.assertFalse(any((self.root/'temp/director-recordings').iterdir()))

if __name__=='__main__': unittest.main()
