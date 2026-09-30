import {parseManuscriptScenes,MANUSCRIPT_SHOT_SECONDS} from './director-manuscript.js';
/** Story and character prototype. Outline parts and cut lines follow NEO's chapter outline and darlings. Not the finished animatic. */
export const PROTOTYPE_VIEWS=['front','side','back','three-quarter','expression'];
export const DESIGN_KINDS=['views','outfits','hair'];
const EVENT_KINDS=['event','shot'];

function clean(value,max,label){
 const text=typeof value==='string'?value.trim():'';
 if(!text||text.length>max)throw Error(label+' must be 1–'+max+' characters.');
 return text;
}

export function blankCharacterSheet(){
 return {
  views:PROTOTYPE_VIEWS.map(name=>({id:crypto.randomUUID(),name,note:''})),
  outfits:[{id:crypto.randomUUID(),name:'Everyday',note:''}],
  hair:[{id:crypto.randomUUID(),name:'None',note:''}]
 };
}

export function parsePrototypeDraft(text){
 const lines=String(text||'').replace(/\r\n/g,'\n').split('\n').map(line=>line.trim()).filter(line=>line&&!line.startsWith('#'));
 const events=[];
 const characters=new Map();
 let character=null;
 let part='';
 for(const line of lines){
  const who=line.match(/^CHARACTER\s+(.+)$/i);
  if(who){character=clean(who[1],80,'Character name');if(!characters.has(character.toLowerCase()))characters.set(character.toLowerCase(),{name:character,views:[],outfits:[],hair:[]});continue;}
  if(!character){
   const partLine=line.match(/^part\s+(.+)$/i);
   if(partLine){part=clean(partLine[1],40,'Part name');continue;}
  }
  if(character){
   const part=line.match(/^(view|outfit|hair)\s+(\S+)(?:\s+([\s\S]*))?$/i);
   if(!part)throw Error('Under a character, write view, outfit, or hair, then a name. Example: view front Empty face');
   const kind=part[1].toLowerCase()==='view'?'views':part[1].toLowerCase()==='outfit'?'outfits':'hair';
   const sheet=characters.get(character.toLowerCase());
   sheet[kind].push({name:clean(part[2],40,'Design name'),note:(part[3]||'').trim().slice(0,400)});
   continue;
  }
  const timing=line.match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(event|shot)\s+(.+)$/i);
  if(!timing)throw Error('Each timeline line needs a start, a length, event or shot, and a title. Example: 0 6 shot Notices the cup');
  const start=Number(timing[1]),seconds=Number(timing[2]);
  if(!Number.isFinite(start)||start<0||start>14400||!Number.isFinite(seconds)||seconds<1||seconds>600)throw Error('Prototype times must start within the episode and last 1–600 seconds.');
  events.push({start,seconds,kind:timing[3].toLowerCase(),title:clean(timing[4],80,'Prototype title'),note:'',part});
 }
 if(events.length>80)throw Error('Use at most 80 prototype events.');
 for(const sheet of characters.values())for(const kind of DESIGN_KINDS)if(sheet[kind].length>16)throw Error('Use at most 16 '+kind+' on one character.');
 if(!events.length&&!characters.size)throw Error('The draft has no prototype timeline or character sheet.');
 return {events,characters:[...characters.values()]};
}

export function applyPrototypeDraft(project,text){
 const draft=parsePrototypeDraft(text);
 const matched=draft.characters.map(sheet=>({sheet,asset:(project.assets||[]).find(item=>item.kind==='character'&&item.name.trim().toLowerCase()===sheet.name.toLowerCase())}));
 const missing=matched.find(item=>!item.asset);
 if(missing)throw Error('Add a character named '+missing.sheet.name+' in the library before applying that sheet.');
 project.story??={beats:[]};
 if(draft.events.length)project.story.prototype={events:draft.events.map(event=>({id:crypto.randomUUID(),...event}))};
 for(const {sheet,asset} of matched){
  asset.design??={views:[],outfits:[],hair:[]};
  for(const kind of DESIGN_KINDS)if(sheet[kind].length)asset.design[kind]=sheet[kind].map(item=>({id:crypto.randomUUID(),name:item.name,note:item.note}));
 }
 return {events:draft.events.length,characters:matched.length};
}

/** Turn NEO manuscript scenes (*** breaks and # titles) into an ordered prototype outline. */
export function outlineFromManuscript(project){
 const scenes=parseManuscriptScenes(project.story?.manuscript||'');
 if(!scenes.length)throw Error('Write the manuscript first. A line that is only *** starts another scene.');
 let start=0;
 const events=scenes.map(scene=>{
  const event={id:crypto.randomUUID(),title:scene.title,start,seconds:MANUSCRIPT_SHOT_SECONDS,kind:'shot',note:scene.script.slice(0,400),part:''};
  start+=MANUSCRIPT_SHOT_SECONDS;
  return event;
 });
 project.story??={beats:[]};
 const darlings=project.story.prototype?.darlings||[];
 project.story.prototype={events,darlings};
 return events.length;
}

/** Park a prototype row the way NEO parks a cut line, so it can come back. */
export function cutPrototypeRow(project,index){
 const board=project.story?.prototype;
 const row=board?.events?.[index];
 if(!row)throw Error('Choose a prototype row.');
 board.events.splice(index,1);
 board.darlings??=[];
 board.darlings.push({id:row.id,title:row.title,note:row.note||'',kind:row.kind});
 if(board.darlings.length>80)board.darlings.shift();
}

export function restoreDarling(project,id){
 const board=project.story?.prototype;
 const index=(board?.darlings||[]).findIndex(item=>item.id===id);
 if(index<0)throw Error('That cut is no longer in the pile.');
 const [darling]=board.darlings.splice(index,1);
 const last=board.events.at(-1);
 const start=last?last.start+last.seconds:0;
 board.events.push({id:crypto.randomUUID(),title:darling.title,note:darling.note||'',kind:darling.kind==='event'?'event':'shot',start,seconds:MANUSCRIPT_SHOT_SECONDS,part:''});
}

export function prototypeShotsToEpisode(project){
 const events=project.story?.prototype?.events||[];
 const shots=events.filter(event=>event.kind==='shot');
 if(!shots.length)throw Error('Mark at least one prototype row as a shot.');
 project.scenes??=[];
 let added=0;
 for(const event of shots){
  const seconds=Math.max(1,Math.min(3600,Math.round(event.seconds)));
  project.scenes.push({
   id:crypto.randomUUID(),
   title:event.title,
   shots:[{id:crypto.randomUUID(),title:event.title,seconds,action:event.note||event.title,camera:'',dialogue:''}]
  });
  added++;
 }
 return added;
}

const SLUG=/^(INT\.|EXT\.|INT\/EXT\.)\s+\S/i;
const CUE=/^[A-Z][A-Z0-9 .'-]{0,40}$/;

/** Formatted screenplay: slug line, action, then a CAPITAL cue and dialogue. */
export function parseScreenplay(text){
 const scenes=[];
 let current=null,mode='action';
 const flush=()=>{if(current&&(current.slug||current.action||current.dialogue))scenes.push(current);};
 for(const raw of String(text||'').replace(/\r\n/g,'\n').split('\n')){
  const line=raw.trim();
  if(!line){mode='action';continue;}
  if(SLUG.test(line)){flush();current={slug:line,action:'',dialogue:''};mode='action';continue;}
  if(!current)current={slug:'',action:'',dialogue:''};
  if(CUE.test(line)&&!SLUG.test(line)){mode='dialogue';continue;}
  if(mode==='dialogue')current.dialogue+=(current.dialogue?'\n':'')+line;
  else current.action+=(current.action?'\n':'')+line;
 }
 flush();
 if(String(text||'').trim()&&!scenes.length)throw Error('Start a scene with INT. or EXT. and a place.');
 return scenes;
}

export function feedScreenplay(project,text){
 const parts=parseScreenplay(text);
 if(!parts.length)throw Error('Write a screenplay scene first. Example: INT. ROOM - DAY');
 project.scenes??=[];
 for(const part of parts){
  const title=(part.slug||part.action||'Scene').slice(0,80);
  project.scenes.push({
   id:crypto.randomUUID(),
   title,
   plan:{script:[part.slug,part.action].filter(Boolean).join('\n')},
   shots:[{id:crypto.randomUUID(),title:'Shot 1',seconds:6,action:part.action.slice(0,280),camera:'',dialogue:part.dialogue}]
  });
 }
 return parts.length;
}

function planImage(file,label){
 if(file===undefined)return;
 if(!file||typeof (file.name||file.filename)!=='string'||!['input','output'].includes(file.type||'input'))throw Error(label+' needs a local image.');
 if(!/\.(png|jpe?g|webp)$/i.test(file.name||file.filename||''))throw Error(label+' needs PNG, JPEG, or WebP.');
}
export function validatePreproduction(project){
 const story=project.story;
 if(story?.screenplay!==undefined){
  if(typeof story.screenplay!=='string'||story.screenplay.length>200000)throw Error('The screenplay must be plain text of at most 200000 characters.');
 }
 if(story?.fiction!==undefined&&story.fiction!=='dark')throw Error('Fiction is cartoon, or dark fiction.');
 if(story?.styleGuide!==undefined){
  const guide=story.styleGuide;
  if(!guide||Array.isArray(guide))throw Error('The style sheet needs shapes, line, palette, light, and never.');
  for(const key of ['shapes','line','palette','light','never'])if(guide[key]!==undefined&&(typeof guide[key]!=='string'||guide[key].length>400))throw Error('Style sheet lines must be 400 characters or fewer.');
 }
 for(const scene of project.scenes||[])for(const shot of scene.shots||[]){
  if(shot.reelWatched!==undefined&&shot.reelWatched!==true)throw Error('Mark the story reel watched, or leave that mark off.');
  if(shot.colorScript!==undefined){
   const color=shot.colorScript;
   if(!color||Array.isArray(color))throw Error('A color script needs light, palette, and mood.');
   for(const key of ['light','palette','mood'])if(color[key]!==undefined&&(typeof color[key]!=='string'||color[key].length>200))throw Error('Color script lines must be 200 characters or fewer.');
   planImage(color.frame,'A color frame');
  }
  if(shot.layout!==undefined){
   const layout=shot.layout;
   if(!layout||Array.isArray(layout))throw Error('A layout sheet needs camera, direction, contacts, and movement.');
   if(layout.direction!==undefined&&!['screen-left','screen-right','neutral'].includes(layout.direction))throw Error('Screen direction is screen-left, screen-right, or neutral.');
   for(const key of ['camera','contacts','movement'])if(layout[key]!==undefined&&(typeof layout[key]!=='string'||layout[key].length>400))throw Error('Layout notes must be 400 characters or fewer.');
   planImage(layout.drawing,'A layout drawing');
  }
 }
}

export function validatePrototype(project){
 const story=project.story;
 if(!story?.prototype)return;
 const board=story.prototype;
 if(!board||Array.isArray(board)||!Array.isArray(board.events)||board.events.length>80)throw Error('The prototype board needs at most 80 events.');
 const darlings=board.darlings||[];
 if(board.darlings!==undefined&&(!Array.isArray(darlings)||darlings.length>80))throw Error('Keep at most 80 cut prototype lines.');
 const ids=new Set();
 for(const event of board.events){
  if(!event||typeof event.id!=='string'||!event.id||ids.has(event.id))throw Error('Prototype events need unique ids.');
  ids.add(event.id);
  if(!EVENT_KINDS.includes(event.kind))throw Error('A prototype row is an event or a shot.');
  if(typeof event.title!=='string'||!event.title.trim()||event.title.length>80)throw Error('Prototype titles must be 1–80 characters.');
  if(event.note!==undefined&&(typeof event.note!=='string'||event.note.length>400))throw Error('Prototype notes must be 400 characters or fewer.');
  if(event.part!==undefined&&(typeof event.part!=='string'||event.part.length>40))throw Error('A prototype part name must be 40 characters or fewer.');
  if(!Number.isFinite(event.start)||event.start<0||event.start>14400||!Number.isFinite(event.seconds)||event.seconds<1||event.seconds>600)throw Error('Prototype times must start within the episode and last 1–600 seconds.');
 }
 for(const darling of darlings){
  if(!darling||typeof darling.id!=='string'||!darling.id||ids.has(darling.id))throw Error('Cut lines need their own ids.');
  ids.add(darling.id);
  if(!EVENT_KINDS.includes(darling.kind))throw Error('A cut line is an event or a shot.');
  if(typeof darling.title!=='string'||!darling.title.trim()||darling.title.length>80)throw Error('Cut line titles must be 1–80 characters.');
  if(darling.note!==undefined&&(typeof darling.note!=='string'||darling.note.length>400))throw Error('Cut line notes must be 400 characters or fewer.');
 }
 for(const asset of project.assets||[]){
  if(asset.design===undefined)continue;
  if(asset.kind!=='character'||!asset.design||Array.isArray(asset.design))throw Error('Only a character can have a design sheet.');
  for(const kind of DESIGN_KINDS){
   const list=asset.design[kind]||[];
   if(!Array.isArray(list)||list.length>16)throw Error('Use at most 16 '+kind+' on one character.');
   const names=new Set();
   for(const item of list){
    if(!item||typeof item.id!=='string'||!item.id||names.has(item.id))throw Error('Design rows need unique ids.');
    names.add(item.id);
    if(typeof item.name!=='string'||!item.name.trim()||item.name.length>40)throw Error('Design names must be 1–40 characters.');
    if(item.note!==undefined&&(typeof item.note!=='string'||item.note.length>400))throw Error('Design notes must be 400 characters or fewer.');
    if(item.drawing!==undefined){
     const file=item.drawing;
     if(!file||typeof (file.name||file.filename)!=='string')throw Error('A design drawing needs a local image.');
     if(!/\.(png|jpe?g|webp)$/i.test(file.name||file.filename||''))throw Error('Design drawings need PNG, JPEG, or WebP.');
    }
   }
  }
  if(asset.design.height!==undefined&&(!Number.isFinite(asset.design.height)||asset.design.height<0.2||asset.design.height>4))throw Error('Character height is measured in door-heights, from 0.2 to 4.');
  if(asset.design.scaleNote!==undefined&&(typeof asset.design.scaleNote!=='string'||asset.design.scaleNote.length>200))throw Error('The size-chart note must be 200 characters or fewer.');
  if(asset.design.shape!==undefined&&(typeof asset.design.shape!=='string'||asset.design.shape.length>200))throw Error('A character silhouette must be 200 characters or fewer.');
 }
}
