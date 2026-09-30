"""Bounded Hermes conversation; Bonsai plans and Needle extracts on CPU."""
import json
import os
from pathlib import Path
import sys
import time

ROOT=Path(__file__).resolve().parents[2]
os.environ['HERMES_HOME']=str(ROOT/'studio-config/hermes')
os.environ['PYTHONUTF8']='1'
from run_agent import AIAgent
from tools.mcp_tool import discover_mcp_tools, shutdown_mcp_servers

started=time.monotonic()
try:
    discovered=discover_mcp_tools()
    agent=AIAgent(model='bonsai-2-27b',provider='custom',api_key='local',base_url='http://127.0.0.1:8089/v1',enabled_toolsets=['mcp-studio','skills'],max_iterations=6,max_tokens=768,quiet_mode=True,skip_context_files=True,request_overrides={'extra_body':{'chat_template_kwargs':{'enable_thinking':False}},'temperature':0})
    prompt=sys.argv[1] if len(sys.argv)>1 else 'Load the studio-cartoon-review skill. Call extract_cartoon_shot with this exact request: Mira waves in the observatory for 6 seconds. Compare Needle output with that request. Report any mismatched fields and return the corrected shot JSON. Do not claim tools ran unless you called them.'
    result=agent.run_conversation(prompt,system_message='You are a local cartoon production reviewer. Use the supplied skill and CPU extraction tool. Keep replies concise. Needle is fallible: check literal facts before accepting its output. You cannot render footage or edit projects through these tools.')
    report={'elapsed_seconds':round(time.monotonic()-started,1),'discovered':discovered,'result':result}
    (ROOT/'reports/studio/hermes-needle-review.json').write_text(json.dumps(report,indent=2,default=str),encoding='utf-8')
    print(json.dumps({'elapsed_seconds':report['elapsed_seconds'],'final_response':result.get('final_response'),'tools':discovered}),flush=True)
    if result.get('failed'):
        raise RuntimeError(result.get('error','Hermes did not complete the review.'))
finally:
    shutdown_mcp_servers()
