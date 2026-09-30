"""CPU-only Needle extraction for the isolated Studio Hermes profile."""
import json
from pathlib import Path
import subprocess
import tempfile
from mcp.server.fastmcp import FastMCP

ROOT = Path(__file__).resolve().parents[2]
MODELS = Path(r'D:\ai\Local-Models\models\Needle-3')
mcp = FastMCP('studio', host='127.0.0.1', port=8191)
SCHEMA = [{'type':'function','function':{'name':'propose_shot','description':'Extract only supplied cartoon shot details.','parameters':{'type':'object','properties':{'character':{'type':'string','description':'Character name only'},'setting':{'type':'string','description':'Location only'},'action':{'type':'string','description':'Visible action'},'duration_seconds':{'type':'integer'}},'required':['character','setting','action','duration_seconds']}}}]


@mcp.tool()
def extract_cartoon_shot(request: str) -> dict:
    """Use Needle 3 on CPU to extract one shot. Compare every field with the original request; output is fallible. No project mutation."""
    if not request.strip() or len(request)>1500:
        raise ValueError('Supply a shot request under 1,500 characters.')
    with tempfile.TemporaryDirectory(prefix='hermes-needle-') as temp:
        schema=Path(temp)/'schema.json';schema.write_text(json.dumps(SCHEMA),encoding='utf-8')
        result=subprocess.run([str(MODELS/'windows-x86_64/needle.exe'),'--model',str(MODELS/'needle3.cact'),'--tools',str(schema),'--prompt',request,'--max','128'],capture_output=True,text=True,encoding='utf-8',timeout=60,check=True,creationflags=subprocess.CREATE_NO_WINDOW)
    answer={'request':request,'needle':json.loads(result.stdout),'review_required':True}
    with (ROOT/'reports/studio/hermes-needle-calls.jsonl').open('a',encoding='utf-8') as log:
        log.write(json.dumps(answer)+'\n')
    return answer


if __name__=='__main__':mcp.run(transport='streamable-http')
