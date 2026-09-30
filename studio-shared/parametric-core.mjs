// Parametric geometry core: deterministic, headless (no DOM/WebGL/network).
// Units: metres. Right-handed, +Y up. Material default studio_neutral_v1.
export const GENERATOR_VERSION = '1.0.0';
export const NEUTRAL = { baseColorFactor: [0.5, 0.5, 0.5, 1.0], metallicFactor: 0.0,
  roughnessFactor: 0.8, alphaMode: 'OPAQUE', doubleSided: false };

export const RECIPES = {
  box: { params: { width: 0.1, height: 0.1, depth: 0.1 },
         defaults: { width: 0.1, height: 0.1, depth: 0.1 }, centered: true },
  sphere: { params: { radius: 0.05, lon: 32, lat: 16 },
            defaults: { radius: 0.05, lon: 32, lat: 16 } },
  cylinder: { params: { radius: 0.05, height: 0.1, radial: 32 },
              defaults: { radius: 0.05, height: 0.1, radial: 32 } },
  plane: { params: { width: 1.0, depth: 1.0 }, defaults: { width: 1.0, depth: 1.0 } },
  display_plinth: { params: { width: 0.4, height: 0.1, depth: 0.4 },
                    defaults: { width: 0.4, height: 0.1, depth: 0.4 } },
};

function dim(v, name) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0.0001 || v > 1000)
    throw new Error(`${name} must be finite in [0.0001, 1000] m`);
  return v;
}
function segs(v, name, lo, hi) {
  if (!Number.isInteger(v) || v < lo || v > hi)
    throw new Error(`${name} must be an integer in [${lo}, ${hi}]`);
  return v;
}
function material(m) {
  const out = { ...NEUTRAL };
  if (m === undefined) return out;
  if (typeof m.color === 'string') {
    const mt = /^#([0-9a-fA-F]{6})$/.exec(m.color);
    if (!mt) throw new Error('color must be #rrggbb');
    const rgb = [0, 2, 4].map(i => parseInt(mt[1].slice(i, i + 2), 16) / 255);
    const lin = rgb.map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    out.baseColorFactor = [...lin, 1.0];
  }
  for (const [k, lo, hi] of [['metallicFactor', 0, 1], ['roughnessFactor', 0, 1]]) {
    if (m[k] !== undefined) {
      if (typeof m[k] !== 'number' || m[k] < lo || m[k] > hi) throw new Error(`${k} out of range`);
      out[k] = m[k];
    }
  }
  return out;
}

function mesh() { return { pos: [], nrm: [], uv: [], idx: [] }; }
function quad(m, a, b, c, d, n) {
  const base = m.pos.length / 3;
  for (const v of [a, b, c, d]) { m.pos.push(...v); m.nrm.push(...n); m.uv.push(0, 0); }
  m.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function boxGeometry(w, h, d, cy = 0) {
  const m = mesh();
  const x = w / 2, y = h / 2, z = d / 2;
  quad(m, [x, cy - y, -z], [x, cy + y, -z], [x, cy + y, z], [x, cy - y, z], [1, 0, 0]);
  quad(m, [-x, cy - y, z], [-x, cy + y, z], [-x, cy + y, -z], [-x, cy - y, -z], [-1, 0, 0]);
  quad(m, [-x, cy + y, -z], [-x, cy + y, z], [x, cy + y, z], [x, cy + y, -z], [0, 1, 0]);
  quad(m, [-x, cy - y, z], [-x, cy - y, -z], [x, cy - y, -z], [x, cy - y, z], [0, -1, 0]);
  quad(m, [-x, cy - y, z], [x, cy - y, z], [x, cy + y, z], [-x, cy + y, z], [0, 0, 1]);
  quad(m, [-x, cy - y, -z], [-x, cy + y, -z], [x, cy + y, -z], [x, cy - y, -z], [0, 0, -1]);
  return m;
}

function sphereGeometry(r, lon, lat) {
  const m = mesh();
  for (let j = 0; j <= lat; j++) {
    const th = (j / lat) * Math.PI, st = Math.sin(th), ct = Math.cos(th);
    for (let i = 0; i <= lon; i++) {
      const ph = (i / lon) * 2 * Math.PI;
      const n = [st * Math.cos(ph), ct, st * Math.sin(ph)];
      m.pos.push(n[0] * r, n[1] * r, n[2] * r);
      m.nrm.push(...n);
      m.uv.push(i / lon, j / lat);
    }
  }
  for (let j = 0; j < lat; j++) for (let i = 0; i < lon; i++) {
    const a = j * (lon + 1) + i, b = a + 1, c = a + lon + 1, d = c + 1;
    m.idx.push(a, b, c, b, d, c);
  }
  return m;
}

function cylinderGeometry(r, h, radial) {
  const m = mesh();
  const y0 = -h / 2, y1 = h / 2;
  for (let i = 0; i < radial; i++) {
    const a0 = (i / radial) * 2 * Math.PI, a1 = ((i + 1) / radial) * 2 * Math.PI;
    const p = [[r * Math.cos(a0), y0, r * Math.sin(a0)], [r * Math.cos(a1), y0, r * Math.sin(a1)],
               [r * Math.cos(a1), y1, r * Math.sin(a1)], [r * Math.cos(a0), y1, r * Math.sin(a0)]];
    const n0 = [Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)];
    const base = m.pos.length / 3;
    for (const v of p) { m.pos.push(...v); m.nrm.push(...n0); m.uv.push(0, 0); }
    m.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  for (const [y, flip] of [[y1, false], [y0, true]]) {
    const c = m.pos.length / 3;
    m.pos.push(0, y, 0); m.nrm.push(0, flip ? -1 : 1, 0); m.uv.push(0.5, 0.5);
    for (let i = 0; i < radial; i++) {
      const a0 = (i / radial) * 2 * Math.PI, a1 = ((i + 1) / radial) * 2 * Math.PI;
      const v0 = m.pos.length / 3;
      m.pos.push(r * Math.cos(a0), y, r * Math.sin(a0));
      m.nrm.push(0, flip ? -1 : 1, 0); m.uv.push(0, 0);
      const v1 = m.pos.length / 3;
      m.pos.push(r * Math.cos(a1), y, r * Math.sin(a1));
      m.nrm.push(0, flip ? -1 : 1, 0); m.uv.push(0, 0);
      if (!flip) m.idx.push(c, v1, v0); else m.idx.push(c, v0, v1);
    }
  }
  return m;
}

export function build(recipeId, rawParams = {}) {
  const def = RECIPES[recipeId];
  if (!def) throw new Error(`unknown recipe ${recipeId}`);
  const p = { ...def.defaults, ...rawParams };
  let m, doubleSided = false;
  if (recipeId === 'box') m = boxGeometry(dim(p.width, 'width'), dim(p.height, 'height'), dim(p.depth, 'depth'));
  else if (recipeId === 'display_plinth') {
    const w = dim(p.width, 'width'), h = dim(p.height, 'height'), d = dim(p.depth, 'depth');
    m = boxGeometry(w, h, d, h / 2);
  } else if (recipeId === 'sphere') m = sphereGeometry(dim(p.radius, 'radius'), segs(p.lon, 'lon', 3, 256), segs(p.lat, 'lat', 2, 128));
  else if (recipeId === 'cylinder') m = cylinderGeometry(dim(p.radius, 'radius'), dim(p.height, 'height'), segs(p.radial, 'radial', 3, 256));
  else if (recipeId === 'plane') {
    const w = dim(p.width, 'width'), d = dim(p.depth, 'depth');
    m = mesh();
    m.pos.push(-w / 2, 0, -d / 2, w / 2, 0, -d / 2, w / 2, 0, d / 2, -w / 2, 0, d / 2);
    for (let i = 0; i < 4; i++) { m.nrm.push(0, 1, 0); m.uv.push(0, 0); }
    m.idx.push(0, 2, 1, 0, 3, 2);
    doubleSided = true;
  }
  const mat = material(rawParams.material);
  mat.doubleSided = doubleSided;
  const resolved = { ...p, material: undefined };
  delete resolved.material;
  return { geometry: m, material: mat, resolvedParams: resolved };
}

export function statistics(m) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.pos.length; i += 3)
    for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], m.pos[i + k]); mx[k] = Math.max(mx[k], m.pos[i + k]); }
  return { uniqueTriangles: m.idx.length / 3, renderedTriangles: m.idx.length / 3,
    vertices: m.pos.length / 3, bounds: [mn, mx], objects: 1, materials: 1 };
}

export function toGlb(geometry, mat) {
  const pos = new Float32Array(geometry.pos);
  const nrm = new Float32Array(geometry.nrm);
  const uv = new Float32Array(geometry.uv);
  const use32 = geometry.pos.length / 3 > 65535;
  const idx = use32 ? new Uint32Array(geometry.idx) : new Uint16Array(geometry.idx);
  const parts = [pos, nrm, uv, idx];
  const views = [];
  let off = 0;
  const blobs = [];
  for (const arr of parts) {
    views.push({ buffer: 0, byteOffset: off, byteLength: arr.byteLength });
    blobs.push(Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength));
    off += arr.byteLength;
    while (off % 4) { off++; }
  }
  const bin = Buffer.concat(blobs);
  const pad = off - bin.length;
  const binPadded = Buffer.concat([bin, Buffer.alloc(pad)]);
  const mn = [Math.min(...geometry.pos.filter((_, i) => i % 3 === 0)),
              Math.min(...geometry.pos.filter((_, i) => i % 3 === 1)),
              Math.min(...geometry.pos.filter((_, i) => i % 3 === 2))];
  const mx = [Math.max(...geometry.pos.filter((_, i) => i % 3 === 0)),
              Math.max(...geometry.pos.filter((_, i) => i % 3 === 1)),
              Math.max(...geometry.pos.filter((_, i) => i % 3 === 2))];
  const doc = {
    asset: { version: '2.0', generator: `studio-parametric-core ${GENERATOR_VERSION}` },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
      indices: 3, mode: 4, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: mat.baseColorFactor,
      metallicFactor: mat.metallicFactor, roughnessFactor: mat.roughnessFactor },
      alphaMode: mat.alphaMode, doubleSided: mat.doubleSided }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: pos.length / 3, type: 'VEC3', min: mn, max: mx },
      { bufferView: 1, componentType: 5126, count: nrm.length / 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: uv.length / 2, type: 'VEC2' },
      { bufferView: 3, componentType: use32 ? 5125 : 5123, count: idx.length, type: 'SCALAR' }],
    bufferViews: views, buffers: [{ byteLength: binPadded.length }],
  };
  const jsonRaw = Buffer.from(JSON.stringify(doc));
  const jsonPad = (4 - (jsonRaw.length % 4)) % 4;
  const total = 12 + 8 + jsonRaw.length + jsonPad + 8 + binPadded.length;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(0x46546C67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonRaw.length + jsonPad, 12); out.writeUInt32LE(0x4E4F534A, 16);
  jsonRaw.copy(out, 20); out.fill(0x20, 20 + jsonRaw.length, 20 + jsonRaw.length + jsonPad);
  const bo = 20 + jsonRaw.length + jsonPad;
  out.writeUInt32LE(binPadded.length, bo); out.writeUInt32LE(0x004E4942, bo + 4);
  binPadded.copy(out, bo + 8);
  return out;
}
