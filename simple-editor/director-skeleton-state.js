export function validateSkeleton(joints){
 if(!Array.isArray(joints)||!joints.length||joints.length>128)throw Error('Use 1–128 skeleton joints.');
 joints.forEach((j,i)=>{if(!j||typeof j.name!=='string'||!j.name.trim()||j.name.length>100||!Number.isInteger(j.parent)||j.parent< -1||j.parent>=i||!Array.isArray(j.position)||j.position.length!==3||!j.position.every(v=>Number.isFinite(v)&&Math.abs(v)<=1e6))throw Error('Each joint needs a name, valid position, and an earlier parent joint.');});
}
export function validateSkeletonDraft(draft){
 if(draft===undefined)return;validateSkeleton(draft.joints);
 const f=draft.model;if(!f||typeof f.name!=='string'||!f.name.endsWith('.glb')||/[\\/]/.test(f.name)||f.type!=='input'||typeof f.subfolder!=='string'||f.subfolder.split(/[\\/]/).includes('..'))throw Error('Invalid skeleton draft model.');
}
export function compileBoneWeights(joints,smooth=true){
 const segments=joints.map((j,i)=>{const children=joints.filter(c=>c.parent===i);return children.length?children.map(c=>[j.position,c.position]):[[j.position,j.position]];});
 return point=>{
 const distance=(a,b)=>{const v=b.map((x,k)=>x-a[k]),w=point.map((x,k)=>x-a[k]),d=v.reduce((n,x)=>n+x*x,0),t=d?Math.max(0,Math.min(1,v.reduce((n,x,k)=>n+x*w[k],0)/d)):0;return Math.hypot(...w.map((x,k)=>x-t*v[k]));};
 const nearest=segments.map((segments,i)=>({i,d:Math.min(...segments.map(([a,b])=>distance(a,b)))})).sort((a,b)=>a.d-b.d).slice(0,smooth?4:1);
 const values=nearest.map(n=>1/Math.max(1e-8,n.d*n.d*n.d*n.d)),sum=values.reduce((a,b)=>a+b,0);return nearest.map((n,i)=>[n.i,values[i]/sum]);};
}
export const boneWeights=(point,joints,smooth=true)=>compileBoneWeights(joints,smooth)(point);
