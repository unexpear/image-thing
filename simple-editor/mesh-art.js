const $=id=>document.getElementById(id);
export const artPresets={
 game:{label:'Game prop',detail:128,faces:5000,steps:20,crease:60,surface:'matte',levels:0,collision:true,note:'Small static prop. Check scale and assign the collision box in your engine.'},
 anime:{label:'Anime / cartoon prop',detail:128,faces:10000,steps:20,crease:180,surface:'matte',levels:6,collision:false,note:'Smooth shading and simplified texture colors. Use a stylized reference for the silhouette. Cel shadows and outlines need an engine or Blender shader.'},
 lowpoly:{label:'Faceted cartoon',detail:128,faces:5000,steps:10,crease:0,surface:'matte',levels:4,collision:true,note:'Hard face normals and a small triangle budget. The reference still controls the shape.'},
 film:{label:'Film / scene blocking',detail:192,faces:20000,steps:20,crease:180,surface:'matte',levels:0,collision:false,note:'More geometry for background props and scene blocking; slower. Hero assets still need retopology and art finishing.'}
};
const preset=document.createElement('label');preset.className='field';preset.innerHTML='<span>Starting point</span><select id="art-preset"><option value="">Current settings · beginner</option></select><span id="art-note" class="hint">Optional presets for static props. You can adjust their settings.</span>';
$('front').closest('label').before(preset);
for(const [key,value] of Object.entries(artPresets))$('art-preset').add(new Option(value.label,key));
const panel=document.createElement('details');panel.className='settings';panel.innerHTML=`<summary>Art direction · cartoon & materials</summary><label class="field">Surface<select id="art-surface"><option value="original">Original material</option><option value="matte">Matte · lighting and shadows</option><option value="flat">Flat solid color · no lighting</option></select></label><label class="field">Color / texture tint<input type="color" id="art-color" value="#ffffff"></label><label class="field">Edges<select id="art-crease"><option value="60">Balanced · keep sharp edges</option><option value="180">Smooth · rounded cartoon surfaces</option><option value="0">Faceted · hard triangle edges</option></select></label><label class="field">Texture colors<select id="art-levels"><option value="0">Keep original colors</option><option value="4">4 levels per channel · graphic</option><option value="6">6 levels per channel · cartoon</option><option value="12">12 levels per channel · subtle</option></select></label><p class="hint">Tint and color simplification apply with Matte. Flat solid color requires no texture. These controls change the exported material and normals, not the generated silhouette. No rig or animation is added.</p>`;
$('create-mesh').before(panel);
$('art-preset').onchange=()=>{const p=artPresets[$('art-preset').value];if(!p)return;for(const id of ['detail','faces','steps'])$(id).value=p[id];$('art-crease').value=p.crease;$('art-surface').value=p.surface;$('art-levels').value=p.levels;$('finish-collision').checked=p.collision;$('art-note').textContent=p.note;};
export function artOptions(){return {artPreset:$('art-preset').value,surface:$('art-surface').value,color:$('art-color').value,crease:Number($('art-crease').value),textureLevels:Number($('art-levels').value)};}
export function styleGraph(graph,options,mesh){
 graph['18'].inputs.crease_angle=options.crease??60;
 if(!options.surface||options.surface==='original')return mesh;
 graph['26']={class_type:'StudioMeshStyle',inputs:{mesh,surface:options.surface,color:options.color||'#ffffff',texture_levels:options.textureLevels||0}};
 return ['26',0];
}
const preview=document.createElement('div');preview.className='result-actions';preview.innerHTML='<button type="button" id="art-spin" aria-pressed="false">Turntable</button><button type="button" id="art-front">Front view</button><button type="button" id="art-side">Side view</button><button type="button" id="art-reset">Reset view</button>';
$('mesh-viewer').after(preview);
$('art-spin').onclick=()=>{const viewer=$('mesh-viewer'),on=!viewer.hasAttribute('auto-rotate');viewer.toggleAttribute('auto-rotate',on);$('art-spin').setAttribute('aria-pressed',String(on));$('art-spin').textContent=on?'Stop turntable':'Turntable';};
for(const [id,orbit] of [['art-front','0deg 90deg auto'],['art-side','90deg 90deg auto'],['art-reset','0deg 75deg auto']])$(id).onclick=()=>{$('mesh-viewer').setAttribute('camera-orbit',orbit);$('mesh-viewer').setAttribute('camera-target','auto auto auto');};
