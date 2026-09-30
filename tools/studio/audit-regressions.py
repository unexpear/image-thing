"""Isolated regression checks. No production DB, media or GPU access."""
import sys,types,unittest
from pathlib import Path
from unittest.mock import patch
root=Path(__file__).resolve().parents[2]
pkg=types.ModuleType('audit_jobs');pkg.__path__=[str(root/'ComfyUI_windows_portable/ComfyUI/custom_nodes/studio_jobs')];sys.modules['audit_jobs']=pkg
from audit_jobs import service,auth
class Checks(unittest.TestCase):
 def body(self,kind='generate_image',**params):
  return dict(schema_version=1,kind=kind,expected_epoch='test',idempotency_key='test',parameters=params)
 def test_validation(self):
  for params in [{'workflow_id':[]},{'workflow_id':'video-animate'},{'workflow_id':'image-quality-8step'},{'workflow_id':'image-quality-8step','image':'a','prompt':'edit','seed':True}]:
   with self.subTest(params=params):self.assertIsNotNone(service.validate_start(self.body(**params))[1])
  self.assertIsNone(service.validate_start(self.body(workflow_id='image-quality-8step',image='a',prompt='edit',seed=42))[1])
 def test_host(self):
  for host,expected in [('localhost:8188',True),('127.0.0.1:8188',True),('[::1]:8188',True),('[::1',False),('localhost.evil:8188',False),('evil@localhost:8188',False)]:
   with self.subTest(host=host):self.assertEqual(auth.check_loopback(types.SimpleNamespace(remote='::1',headers={'Host':host})),expected)
 def test_missing_queued_job(self):
  job=dict(job_id='j',state='queued',prompt_id='p',created_ns=0)
  with patch.object(service,'enforce_timeout',return_value=False),patch.object(service.store,'get_job',return_value=job),patch.object(service.store,'now_ns',return_value=61_000_000_000),patch.object(service.queue_adapter,'state',return_value={'running':[],'pending':[]}),patch.object(service.queue_adapter,'snapshot_history_entry',return_value=None),patch.object(service.store,'transition') as transition:
   service.reconcile_job('j');self.assertEqual(transition.call_args.args,('j','queued','unknown'))
 def test_no_double_publish(self):
  with patch.object(service.store,'get_job',side_effect=[{'state':'running'},{'state':'succeeded'}]),patch.object(service.store,'transition') as transition:
   service._absorb_history('j',{'status':{'completed':True},'outputs':{}});transition.assert_not_called()
 def test_cancel_wins(self):
  with patch.object(service.store,'get_job',side_effect=[{'state':'running'},{'state':'cancel_requested'}]),patch.object(service.store,'transition') as transition:
   service._absorb_history('j',{'status':{'completed':True},'outputs':{}});self.assertEqual(transition.call_args.args,('j','cancel_requested','cancelled'))
if __name__=='__main__':unittest.main()
