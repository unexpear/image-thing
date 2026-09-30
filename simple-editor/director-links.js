export function shotStarts(project){let start=0;const result=new Map();for(const scene of project.scenes)for(const shot of scene.shots){result.set(shot.id,start);start+=shot.seconds;}return result;}
export function followShots(before,after){
 const old=shotStarts(before),next=shotStarts(after);
 for(const clip of after.episodeAudio||[]){
  if(!clip.anchorShot)continue;
  if(!next.has(clip.anchorShot)){delete clip.anchorShot;continue;}
  if(old.has(clip.anchorShot))clip.start+=next.get(clip.anchorShot)-old.get(clip.anchorShot);
 }
}
