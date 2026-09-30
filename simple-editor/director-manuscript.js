/* Manuscript helpers adapted from NEO 1.2.0 (MIT).
 * Copyright (c) 2026 Hugh Howey
 * Permission notice: see NOTICE-NEO.md in the repository root.
 */
export const MANUSCRIPT_MAX_CHARS=200000;
export const MANUSCRIPT_SHOT_SECONDS=6;
const SCENE_BREAK=/^\*\*\*$/;
const SCENE_TITLE=/^#\s+(.+)$/;

/** NEO-compatible word count: non-space tokens that contain a letter or number. */
export function countWords(text){
 const trimmed=String(text??'').trim();
 if(!trimmed)return 0;
 return (trimmed.match(/\S+/g)||[]).filter(w=>/[\p{L}\p{N}]/u.test(w)).length;
}

export function normalizeManuscript(text){
 if(text===undefined||text===null)return '';
 if(typeof text!=='string')throw Error('Manuscript must be plain text.');
 if(text.length>MANUSCRIPT_MAX_CHARS)throw Error('Manuscript must be at most '+MANUSCRIPT_MAX_CHARS+' characters.');
 return text;
}

/**
 * Split manuscript into scenes.
 * A line that is only *** is a scene break (NEO).
 * A line `# Title` starts a scene title for the following body.
 */
export function parseManuscriptScenes(text){
 const source=normalizeManuscript(text);
 const scenes=[];
 let title='';
 let body=[];
 const flush=()=>{
  const script=body.join('\n').replace(/^\n+/,'').replace(/\n+$/,'');
  if(!title.trim()&&!script.trim()){body=[];return;}
  scenes.push({title:title.trim()||('Scene '+(scenes.length+1)),script});
  title='';body=[];
 };
 for(const line of source.split(/\r?\n/)){
  if(SCENE_BREAK.test(line.trim())){flush();continue;}
  const heading=line.match(SCENE_TITLE);
  if(heading){
   if(title.trim()||body.some(l=>l.trim()))flush();
   title=heading[1].trim();
   continue;
  }
  body.push(line);
 }
 flush();
 return scenes;
}

function firstParagraph(script){
 const parts=String(script||'').split(/\n\s*\n/);
 for(const part of parts){
  const t=part.trim();
  if(t)return t.replace(/\s+/g,' ');
 }
 return '';
}

function actionFromScript(script){
 const para=firstParagraph(script);
 if(!para)return '';
 return para.length>280?para.slice(0,277)+'…':para;
}

/** Append manuscript scenes (and one editable shot each). Existing scenes stay. */
export function feedManuscript(project,text){
 const parts=parseManuscriptScenes(text);
 if(!parts.length)throw Error('Manuscript has no scenes to feed. Add text, # Title lines, or *** scene breaks.');
 project.scenes??=[];
 const added=[];
 for(const part of parts){
  const scene={
   id:crypto.randomUUID(),
   title:part.title,
   plan:{script:part.script},
   shots:[{
    id:crypto.randomUUID(),
    title:'Shot 1',
    seconds:MANUSCRIPT_SHOT_SECONDS,
    action:actionFromScript(part.script),
    camera:'',
    dialogue:''
   }]
  };
  project.scenes.push(scene);
  added.push(scene);
 }
 return {added,count:added.length,words:countWords(text)};
}

export function validateManuscript(story){
 if(!story||story.manuscript===undefined)return;
 story.manuscript=normalizeManuscript(story.manuscript);
}
