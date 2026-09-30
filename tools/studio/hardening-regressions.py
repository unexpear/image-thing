"""Failure-injection tests using only disposable databases and synthetic files."""
import asyncio,importlib.util,json,sys,tempfile,threading,types,unittest
from pathlib import Path
from unittest.mock import patch,Mock
from contextlib import ExitStack
root=Path(__file__).resolve().parents[2]
pkg=types.ModuleType('hardening_jobs');pkg.__path__=[str(root/'ComfyUI_windows_portable/ComfyUI/custom_nodes/studio_jobs')];sys.modules[pkg.__name__]=pkg
from hardening_jobs import service,store
class Hardening(unittest.TestCase):
 def setUp(self):
  self.stack=ExitStack();self.addCleanup(self.stack.close)
  self.temp=Path(self.stack.enter_context(tempfile.TemporaryDirectory())).resolve()
  self.stack.enter_context(patch.object(store,'DATA',self.temp))
  self.stack.enter_context(patch.object(store,'DB_PATH',self.temp/'test.db'))
  self.stack.enter_context(patch.object(store,'_db',None))
  connection=store.db();self.stack.callback(connection.close)
  self.q=types.SimpleNamespace(mutex=threading.RLock())
  self.stack.enter_context(patch.object(service.queue_adapter,'_queue',return_value=self.q))
 def job(self):
  return dict(job_id='j',kind='generate_image',principal='test',idempotency_key='key',request_hash='hash',state='queued',prompt_id='p',boot_id='boot',epoch_at_accept='epoch',created_ns=0,updated_ns=0,reservation={'exec_token':'secret','exec_used':False,'timeout_s':10})
 def test_atomic_idempotency_rollback(self):
  j=self.job();store.create_job(j)
  other=dict(j,job_id='other')
  with self.assertRaises(Exception),store.atomic():store.create_job(other)
  self.assertIsNone(store.get_job('other'));self.assertIsNotNone(store.get_job('j'))
 def test_admission_database_failure_removes_queue(self):
  pending=[]
  async def insert(graph,pid,extra):pending.append(pid);return {'ok':True}
  def remove(pid):pending.remove(pid);return True
  body=dict(schema_version=1,kind='generate_image',expected_epoch='epoch',idempotency_key='new',parameters={'workflow_id':'image-quality-8step','image':'a','prompt':'test'})
  with patch.object(service,'cfg',return_value={'jobs_enabled':True}),patch.object(store,'combined_epoch',return_value='epoch'),patch.object(service.memory_profiles,'resolve',return_value={'ok':True,'effective':'existing'}),patch.object(service.queue_adapter,'compatibility',return_value=True),patch.object(service.queue_adapter,'state',return_value={'running':[],'pending':[]}),patch.object(service,'_floors_ok',return_value=True),patch.object(service,'build_graph',return_value=({'graph':{},'seed':1},None)),patch.object(service.queue_adapter,'validate_and_put',side_effect=insert),patch.object(service.queue_adapter,'remove_pending',side_effect=remove),patch.object(store,'update_job',side_effect=OSError('injected storage failure')):
   with self.assertLogs(level='ERROR'):result=asyncio.run(service.start_job('test',body))
  self.assertEqual(result['http'],503);self.assertEqual(pending,[]);self.assertEqual(store.list_active(),[]);self.assertIsNone(store.find_idempotent('test','new','epoch'))
 def test_fast_saver_and_replay(self):
  store.create_job(self.job())
  with patch.object(service.queue_adapter,'state',return_value={'running':[{'prompt_id':'p'}],'pending':[]}),patch.object(service.artifacts,'staging_dir',return_value=self.temp):
   self.assertEqual(service.verify_exec('j','secret'),self.temp)
   self.assertIsNone(service.verify_exec('j','secret'))
  self.assertEqual(store.get_job('j')['state'],'running')
 def test_wrong_running_job_rejected(self):
  store.create_job(self.job())
  with patch.object(service.queue_adapter,'state',return_value={'running':[{'prompt_id':'other'}],'pending':[]}):self.assertIsNone(service.verify_exec('j','secret'))
 def test_running_timeout_waits_for_ack(self):
  j=self.job();j['state']='running';store.create_job(j)
  with patch.object(store,'now_ns',return_value=11_000_000_000),patch.object(service.queue_adapter,'state',return_value={'running':[{'prompt_id':'p'}],'pending':[]}),patch.object(service.queue_adapter,'remove_pending',return_value=False),patch.object(service.queue_adapter,'interrupt_running') as interrupt:
   self.assertTrue(service.enforce_timeout('j'));interrupt.assert_called_once_with('p')
  self.assertEqual(store.get_job('j')['state'],'cancel_requested')
  service._absorb_history('j',{'status':{'completed':False,'messages':[['execution_interrupted',{}]]},'outputs':{}})
  self.assertEqual(store.get_job('j')['state'],'timed_out')
 def test_pending_timeout(self):
  store.create_job(self.job())
  with patch.object(store,'now_ns',return_value=11_000_000_000),patch.object(service.queue_adapter,'state',return_value={'running':[],'pending':[{'prompt_id':'p'}]}),patch.object(service.queue_adapter,'remove_pending',return_value=True),patch.object(service.queue_adapter,'interrupt_running') as interrupt:
   service.enforce_timeout('j');interrupt.assert_not_called()
  self.assertEqual(store.get_job('j')['state'],'timed_out')
 def test_cleanup_waits_and_removes_staging(self):
  comfy=self.temp/'portable'/'ComfyUI';comfy.mkdir(parents=True)
  staging=self.temp/'studio-data'/'staging';staging.mkdir(parents=True)
  for name in ['result.glb','upload.upload','half.png.part','runner.log']:(staging/name).write_bytes(b'fixture')
  folder=types.ModuleType('folder_paths')
  for name,sub in [('get_input_directory','input'),('get_output_directory','output'),('get_temp_directory','temp')]:setattr(folder,name,lambda sub=sub:str(comfy/sub))
  routes=types.SimpleNamespace(get=lambda *a:lambda fn:fn,post=lambda *a:lambda fn:fn)
  active=Mock(return_value=[{'state':'running'}]);lifecycle=threading.RLock()
  instance=types.SimpleNamespace(routes=routes,prompt_queue=types.SimpleNamespace(mutex=threading.RLock(),get_current_queue_volatile=lambda:([],[]),wipe_history=lambda:None),studio_jobs_service=types.SimpleNamespace(_lc=lifecycle,store=types.SimpleNamespace(list_active=active)))
  server=types.ModuleType('server');server.PromptServer=types.SimpleNamespace(instance=instance)
  spec=importlib.util.spec_from_file_location('test_cleanup',root/'ComfyUI_windows_portable/ComfyUI/custom_nodes/studio_cleanup/__init__.py');module=importlib.util.module_from_spec(spec)
  with patch.dict(sys.modules,{'folder_paths':folder,'server':server}):spec.loader.exec_module(module)
  module.ROOT=comfy;module.STAMP=comfy/'user'/'epoch'
  request=types.SimpleNamespace(headers={'X-Studio-Cleanup':'1'})
  response=asyncio.run(module.clear_media(request));self.assertEqual(response.status,409);self.assertTrue((staging/'result.glb').exists())
  active.return_value=[]
  # Publication owns the same lock; cleanup must wait for it.
  with lifecycle:
   thread=threading.Thread(target=lambda:asyncio.run(module.clear_media(request)));thread.start();thread.join(.1);self.assertTrue(thread.is_alive());self.assertTrue((staging/'result.glb').exists())
  thread.join(3);self.assertFalse(thread.is_alive())
  self.assertEqual([p.name for p in staging.iterdir()],['runner.log']);self.assertTrue(module.STAMP.exists())
if __name__=='__main__':unittest.main()
