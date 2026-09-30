// XYZ Euler degrees at the UI boundary; normalized quaternion interpolation inside.
// Kept independent of the renderer so project validation stays lightweight.
function quaternion(e){
 const [x,y,z]=e.map(v=>v*Math.PI/360),a=Math.cos(x),b=Math.cos(y),c=Math.cos(z),d=Math.sin(x),f=Math.sin(y),g=Math.sin(z);
 return [d*b*c+a*f*g,a*f*c-d*b*g,a*b*g+d*f*c,a*b*c-d*f*g];
}
export function shortestRotation(a,b,t){
 if(t<=0)return [...a];if(t>=1)return [...b];
 const p=quaternion(a);let q=quaternion(b),dot=p.reduce((s,v,i)=>s+v*q[i],0);
 if(dot<0){q=q.map(v=>-v);dot=-dot;}
 dot=Math.min(1,dot);let s=1-t,u=t;
 if(dot<.9995){const angle=Math.acos(dot),sin=Math.sin(angle);s=Math.sin((1-t)*angle)/sin;u=Math.sin(t*angle)/sin;}
 const v=p.map((n,i)=>n*s+q[i]*u),length=Math.hypot(...v),[x,y,z,w]=v.map(n=>n/length);
 const m13=2*(x*z+w*y),m23=2*(y*z-w*x),m33=1-2*(x*x+y*y),m12=2*(x*y-w*z),m11=1-2*(y*y+z*z);
 const result=[Math.abs(m13)<.9999999?Math.atan2(-m23,m33):Math.atan2(2*(y*z+w*x),1-2*(x*x+z*z)),Math.asin(Math.max(-1,Math.min(1,m13))),Math.abs(m13)<.9999999?Math.atan2(-m12,m11):0];
 return result.map(n=>n*180/Math.PI);
}
