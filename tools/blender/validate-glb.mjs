// Studio GLB validator: Khronos format layer + static_mesh_v1 project profile.
// Ported from guitar-tutor tools/guitar-finish-studio/validate-glb.mjs
// (which already used the official gltf-validator); extended with preflight
// caps, input/output split, finding classification, and triangle accounting.
// Usage: node validate-glb.mjs --in file.glb [--target-tris N]
//        [--profile static_mesh_v1] [--json report.json]
import { readFile, writeFile } from 'node:fs/promises';
import { validateBytes } from 'gltf-validator';

const CAPS = { tris: 2000000, verts: 4000000, nodes: 4096, materials: 256,
  textures: 256, texDim: 8192, decodedBytes: 2 * 1024 ** 3, fileBytes: 512 * 1024 ** 2 };
const ALLOWED_REQUIRED_EXTENSIONS = [];

function args() {
  const out = {};
  for (let i = 2; i < process.argv.length; i += 2)
    out[process.argv[i].replace(/^--/, '').replace(/-/g, '_')] = process.argv[i + 1];
  return out;
}

function pngDims(b) {
  if (b.length < 33 || b.readUInt32BE(16) !== 0x49484452) return null;
  return [b.readUInt32BE(16 + 4), b.readUInt32BE(16 + 8)];
}

function jpegDims(b) {
  let i = 2;
  while (i + 4 < b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m))
      return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

function viewBytes(bin, doc, viewIdx) {
  const v = doc.bufferViews[viewIdx];
  const start = (v.byteOffset || 0);
  return bin.subarray(start, start + v.byteLength);
}

function eachPrimitive(doc, fn) {
  for (const mesh of doc.meshes || [])
    for (const prim of mesh.primitives || []) fn(prim);
}

function countTrisVerts(doc) {
  let tris = 0, verts = 0;
  eachPrimitive(doc, prim => {
    const attrs = prim.attributes || {};
    const pos = doc.accessors[attrs.POSITION];
    const vcount = pos ? pos.count : 0;
    verts += vcount;
    if (prim.indices === undefined) tris += Math.floor(vcount / 3);
    else tris += Math.floor((doc.accessors[prim.indices]?.count || 0) / 3);
  });
  return { tris, verts };
}

function countInstances(doc) {
  const refs = new Map();
  for (const node of doc.nodes || []) {
    if (node.mesh === undefined) continue;
    refs.set(node.mesh, (refs.get(node.mesh) || 0) + 1);
  }
  if (!refs.size && (doc.meshes || []).length) refs.set(0, 1);
  return refs;
}

async function main() {
  const a = args();
  const report = { file: a.in || null, profile: a.profile || 'static_mesh_v1',
    target_tris: a.target_tris === undefined ? null : Number(a.target_tris),
    khronos: null, preflight: {}, triangles: null, findings: [], verdict: 'fail' };
  const fatal = (code, message) => report.findings.push({ severity: 'fatal', code, message });
  const repair = (code, message) => report.findings.push({ severity: 'repairable', code, message });
  const warn = (code, message) => report.findings.push({ severity: 'warning', code, message });
  const done = async () => {
    report.verdict = report.findings.some(f => f.severity === 'fatal') ? 'fail' : 'pass';
    if (a.json) await writeFile(a.json, JSON.stringify(report, null, 1));
    else console.log(JSON.stringify(report, null, 1));
    process.exitCode = report.verdict === 'pass' ? 0 : 1;
  };
  if (!a.in) { console.error('Usage: node validate-glb.mjs --in file.glb [--target-tris N] [--json r.json]'); process.exitCode = 2; return; }
  let bytes;
  try { bytes = await readFile(a.in); } catch (e) { fatal('UNREADABLE', String(e)); await done(); return; }
  report.preflight.fileBytes = bytes.length;
  if (bytes.length > CAPS.fileBytes) fatal('FILE_TOO_LARGE', `${bytes.length} > ${CAPS.fileBytes}`);
  if (bytes.length < 20) { fatal('MALFORMED', 'shorter than GLB header'); await done(); return; }
  const magic = bytes.readUInt32LE(0), version = bytes.readUInt32LE(4), length = bytes.readUInt32LE(8);
  if (magic !== 0x46546C67 || version !== 2) { fatal('MALFORMED', 'not a GLB 2 container'); await done(); return; }
  if (length !== bytes.length) { fatal('MALFORMED', `declared length ${length} != actual ${bytes.length}`); await done(); return; }
  const jsize = bytes.readUInt32LE(12), jkind = bytes.readUInt32LE(16);
  if (jkind !== 0x4E4F534A || 20 + jsize > bytes.length) { fatal('MALFORMED', 'bad JSON chunk header'); await done(); return; }
  let doc;
  try { doc = JSON.parse(bytes.subarray(20, 20 + jsize).toString()); }
  catch { fatal('MALFORMED', 'JSON chunk is not valid JSON'); await done(); return; }
  const binoff = 20 + jsize;
  let bin = Buffer.alloc(0);
  if (binoff < bytes.length) {
    const bsize = bytes.readUInt32LE(binoff), bkind = bytes.readUInt32LE(binoff + 4);
    if (bkind !== 0x004E4942) fatal('MALFORMED', 'expected BIN chunk');
    else {
      if (binoff + 8 + bsize > bytes.length) fatal('MALFORMED', 'BIN chunk overruns file');
      else bin = bytes.subarray(binoff + 8, binoff + 8 + bsize);
    }
  }
  // Accessor bounds + finite POSITION + decoded estimate.
  let decoded = 0;
  for (const v of doc.bufferViews || []) decoded += v.byteLength || 0;
  report.preflight.decodedBytes = decoded;
  if (decoded > CAPS.decodedBytes) fatal('DECODED_TOO_LARGE', `${decoded} > ${CAPS.decodedBytes}`);
  const accBad = [];
  (doc.accessors || []).forEach((acc, i) => {
    const v = (doc.bufferViews || [])[acc.bufferView];
    if (!v || (acc.byteOffset || 0) + byteSize(acc) > v.byteLength) accBad.push(i);
  });
  if (accBad.length) fatal('ACCESSOR_OUT_OF_BOUNDS', `accessors ${accBad.join(',')}`);
  else {
    for (const prim of allPrims(doc)) {
      const pi = prim.attributes?.POSITION;
      if (pi === undefined) continue;
      const acc = doc.accessors[pi];
      const raw = viewBytes(bin, doc, acc.bufferView).subarray(acc.byteOffset || 0);
      const f = new Float32Array(raw.buffer, raw.byteOffset, Math.min(acc.count * 3, Math.floor(raw.length / 4)));
      for (let k = 0; k < f.length; k++) if (!Number.isFinite(f[k])) { fatal('NONFINITE_GEOMETRY', `POSITION ${pi}`); break; }
    }
  }
  // Scene extent must be meaningful for view/scale operations.
  const ext = sceneExtent(bin, doc);
  report.preflight.sceneExtent = ext;
  if (!ext || !(ext.diagonal > 0)) fatal('DEGENERATE_EXTENT', 'nonpositive scene extent');
  // Counts vs caps (caps are safety limits, not output targets).
  const { tris, verts } = countTrisVerts(doc);
  const refs = countInstances(doc);
  let instanced = 0;
  for (const [mi, n] of refs) {
    const mtris = meshTris(doc, mi);
    instanced += mtris * n;
  }
  report.triangles = { unique: tris, instanced, verts,
    nodes: (doc.nodes || []).length, materials: (doc.materials || []).length,
    textures: (doc.textures || []).length };
  if (tris > CAPS.tris) fatal('OVER_TRIANGLE_CAP', `${tris} > ${CAPS.tris}`);
  if (verts > CAPS.verts) fatal('OVER_VERTEX_CAP', `${verts} > ${CAPS.verts}`);
  if ((doc.nodes || []).length > CAPS.nodes) fatal('OVER_NODE_CAP', '');
  if ((doc.materials || []).length > CAPS.materials) fatal('OVER_MATERIAL_CAP', '');
  if ((doc.textures || []).length > CAPS.textures) fatal('OVER_TEXTURE_CAP', '');
  // Texture dimensions where decodable.
  (doc.images || []).forEach((img, i) => {
    if (img.uri !== undefined || img.bufferView === undefined) return;
    const b = viewBytes(bin, doc, img.bufferView);
    const d = pngDims(b) || jpegDims(b);
    if (d && (d[0] > CAPS.texDim || d[1] > CAPS.texDim)) fatal('TEXTURE_TOO_LARGE', `image ${i}: ${d}`);
  });
  // Profile: static assets only; no external refs; no unsupported required extensions.
  if ((doc.animations || []).length || (doc.skins || []).length) fatal('NOT_STATIC', 'animations/skins excluded by static_mesh_v1');
  if ((doc.meshes || []).some(m => m.primitives?.some(p => p.targets))) fatal('NOT_STATIC', 'morph targets excluded by static_mesh_v1');
  for (const img of doc.images || []) if (img.uri !== undefined) fatal('EXTERNAL_REF', 'external image URI');
  for (const buf of doc.buffers || []) if (buf.uri !== undefined) fatal('EXTERNAL_REF', 'external buffer URI');
  for (const e of doc.extensionsRequired || [])
    if (!ALLOWED_REQUIRED_EXTENSIONS.includes(e)) fatal('UNSUPPORTED_EXTENSION', e);
  // Zero-length tangents are classified repairable, never silently fixed here.
  const zt = zeroTangentAccessors(bin, doc);
  if (zt.length) repair('ZERO_TANGENTS', `accessors ${zt.join(',')}: run repair-zero-tangents.py, then revalidate`);
  // Khronos format layer.
  try {
    const res = await validateBytes(new Uint8Array(bytes), { maxIssues: 0 });
    report.khronos = { errors: res.issues.numErrors, warnings: res.issues.numWarnings,
      messages: res.issues.messages.filter(m => m.severity < 2).slice(0, 50) };
    if (res.issues.numErrors) fatal('KHRONOS_ERRORS', `${res.issues.numErrors} format errors`);
    for (const m of res.issues.messages.filter(m => m.severity === 2).slice(0, 20))
      warn('KHRONOS_WARNING', `${m.pointer}: ${m.message}`);
  } catch (e) { fatal('VALIDATOR_CRASH', String(e)); await done(); return; }
  // Output target applies to instanced rendered triangles, only when requested.
  if (report.target_tris !== null && Number.isFinite(report.target_tris)) {
    if (instanced > report.target_tris)
      fatal('TRIANGLE_TARGET_UNMET', `${instanced} instanced > target ${report.target_tris}`);
  }
  await done();
}

function byteSize(acc) {
  const comp = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[acc.componentType] || 0;
  const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 }[acc.type] || 0;
  return comp * n * (acc.count || 0);
}

function allPrims(doc) {
  const out = [];
  eachPrimitive(doc, p => out.push(p));
  return out;
}

function meshTris(doc, mi) {
  let t = 0;
  for (const prim of (doc.meshes?.[mi]?.primitives || [])) {
    if (prim.indices === undefined) {
      const p = doc.accessors[prim.attributes?.POSITION];
      t += Math.floor((p?.count || 0) / 3);
    } else t += Math.floor(((doc.accessors[prim.indices] || {}).count || 0) / 3);
  }
  return t;
}

function sceneExtent(bin, doc) {
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], any = false;
  for (const prim of allPrims(doc)) {
    const pi = prim.attributes?.POSITION;
    if (pi === undefined) continue;
    const acc = doc.accessors[pi];
    if (!acc || !acc.min || !acc.max) continue;
    any = true;
    for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], acc.min[k]); mx[k] = Math.max(mx[k], acc.max[k]); }
  }
  if (!any) return null;
  const d = Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
  return { min: mn, max: mx, diagonal: d };
}

function zeroTangentAccessors(bin, doc) {
  const out = [];
  const seen = new Set();
  eachPrimitive(doc, prim => {
    const ti = prim.attributes?.TANGENT, ni = prim.attributes?.NORMAL;
    if (ti === undefined || ni === undefined || seen.has(ti)) return;
    seen.add(ti);
    const t = doc.accessors[ti], n = doc.accessors[ni];
    if (!t || !n || t.componentType !== 5126 || t.type !== 'VEC4' || t.count !== n.count) return;
    const raw = viewBytes(bin, doc, t.bufferView).subarray(t.byteOffset || 0);
    const f = new Float32Array(raw.buffer, raw.byteOffset, Math.min(t.count * 4, Math.floor(raw.length / 4)));
    let bad = 0;
    for (let i = 0; i < t.count; i++) {
      const x = f[i * 4], y = f[i * 4 + 1], z = f[i * 4 + 2];
      if (x * x + y * y + z * z < 1e-12) bad++;
    }
    if (bad) out.push(ti);
  });
  return out;
}

main().catch(e => { console.error('VALIDATOR_CRASH ' + e?.stack || e); process.exitCode = 1; });
