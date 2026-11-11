// The ADVENTURER base body (~/Developer/ADVENTURER/web/assets/adventurer_body.glb, read only) packed for the game:
// only what's used is copied (the source carries tens of MB of dead buffer space), normals and tangents as bytes, joints and
// weights as bytes (KHR_mesh_quantization), textures at most 2048 px, the takedown clips left out. → assets/adventurer.glb
//   node tools/pack-adventurer.mjs [src]
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { execFileSync } from 'child_process';
import { join } from 'path';

const SRC = process.argv[2] || process.env.HOME + '/Developer/ADVENTURER/web/assets/adventurer_body.glb', OUT = 'assets/adventurer.glb';
const TMP = (process.env.TMPDIR || '/tmp') + '/pack-adventurer'; mkdirSync(TMP, { recursive: true });
const glb = readFileSync(SRC), jl = glb.readUInt32LE(12), J = JSON.parse(glb.subarray(20, 20 + jl).toString()), binAt = 20 + jl + 8, BIN = glb.subarray(binAt, binAt + glb.readUInt32LE(20 + jl));
const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }, CS = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const DROP = /^td_/;      // the takedowns (dropped in ADVENTURER)

// read any accessor as plain numbers (normalized ints → their float value)
function read(ai) {
  const A = J.accessors[ai], V = J.bufferViews[A.bufferView], n = NC[A.type], c = CS[A.componentType], stride = V.byteStride || n * c, base = (V.byteOffset || 0) + (A.byteOffset || 0), out = new Float64Array(A.count * n);
  const dv = new DataView(BIN.buffer, BIN.byteOffset);
  const get = { 5120: o => dv.getInt8(o), 5121: o => dv.getUint8(o), 5122: o => dv.getInt16(o, true), 5123: o => dv.getUint16(o, true), 5125: o => dv.getUint32(o, true), 5126: o => dv.getFloat32(o, true) }[A.componentType];
  const nm = A.normalized ? { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 }[A.componentType] : 1;
  for (let i = 0; i < A.count; i++) for (let k = 0; k < n; k++) { const v = get(base + i * stride + k * c); out[i * n + k] = A.normalized ? Math.max(-1, v / nm) : v; }
  return { A, n, data: out };
}
// the new binary, one view per accessor, every view 4-byte aligned
const chunks = []; let off = 0; const views = [], accs = [];
function put(buf, target, stride) { const pad = (4 - (off % 4)) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); off += pad; } const v = { buffer: 0, byteOffset: off, byteLength: buf.length }; if (target) v.target = target; if (stride) v.byteStride = stride; views.push(v); chunks.push(buf); off += buf.length; return views.length - 1; }
function accessor(src, kind) {
  const { A, n, data } = read(src), count = A.count;
  const mk = (ct, norm, elem, write, target, minmax) => {
    const stride = Math.ceil(elem / 4) * 4, buf = Buffer.alloc(count * (target === 34962 ? stride : elem));
    for (let i = 0; i < count; i++) write(buf, i * (target === 34962 ? stride : elem), i);
    const a = { bufferView: put(buf, target, target === 34962 && stride !== elem ? stride : (target === 34962 && kind !== 'anim' ? undefined : undefined)), componentType: ct, count, type: A.type };
    if (target === 34962 && stride !== elem) views[a.bufferView].byteStride = stride;
    if (norm) a.normalized = true; if (minmax) { a.min = A.min; a.max = A.max; }
    accs.push(a); return accs.length - 1;
  };
  const f32 = (target, mm) => mk(5126, false, n * 4, (b, o, i) => { for (let k = 0; k < n; k++) b.writeFloatLE(data[i * n + k], o + k * 4); }, target, mm);
  const i8 = target => mk(5120, true, n, (b, o, i) => { for (let k = 0; k < n; k++) b.writeInt8(Math.max(-127, Math.min(127, Math.round(data[i * n + k] * 127))), o + k); }, target);
  if (kind === 'POSITION') return f32(34962, true);
  if (kind === 'NORMAL' || kind === 'TANGENT') return i8(34962);
  if (kind === 'JOINTS_0') return mk(5121, false, 4, (b, o, i) => { for (let k = 0; k < 4; k++) b.writeUInt8(data[i * 4 + k], o + k); }, 34962);
  if (kind === 'WEIGHTS_0') return mk(5121, true, 4, (b, o, i) => {      // bytes that still add up to exactly 255
    const w = [0, 1, 2, 3].map(k => data[i * 4 + k]), s = w.reduce((p, q) => p + q, 0) || 1, q = w.map(x => Math.round(x / s * 255)); let d = 255 - q.reduce((p, x) => p + x, 0), m = q.indexOf(Math.max(...q)); q[m] += d;
    for (let k = 0; k < 4; k++) b.writeUInt8(q[k], o + k); }, 34962);
  if (kind === 'TEXCOORD_0' && data.every(v => v >= 0 && v <= 1)) return mk(5123, true, n * 2, (b, o, i) => { for (let k = 0; k < n; k++) b.writeUInt16LE(Math.round(data[i * n + k] * 65535), o + k * 2); }, 34962);
  if (kind === 'INDEX') { let mx = 0; for (let i = 0; i < count; i++) if (data[i] > mx) mx = data[i]; const big = mx > 65535; return big ? mk(5125, false, 4, (b, o, i) => b.writeUInt32LE(data[i], o), 34963) : mk(5123, false, 2, (b, o, i) => b.writeUInt16LE(data[i], o), 34963); }
  if (kind === 'anim-in') return f32(undefined, true);
  return f32(kind === 'anim' || kind === 'ibm' ? undefined : 34962);
}
const out = JSON.parse(JSON.stringify({ asset: { version: '2.0', generator: 'aeternum pack-adventurer' }, scene: J.scene, scenes: J.scenes, nodes: J.nodes, materials: J.materials, samplers: J.samplers, textures: J.textures }));
out.extensionsUsed = ['KHR_mesh_quantization']; out.extensionsRequired = ['KHR_mesh_quantization'];
out.meshes = J.meshes.map(m => ({ name: m.name, primitives: m.primitives.map(p => {
  const q = { attributes: {}, material: p.material, mode: p.mode };
  const bump = J.materials[p.material]?.normalTexture;
  for (const [k, a] of Object.entries(p.attributes)) { if (k === 'TANGENT' && !bump) continue; q.attributes[k] = accessor(a, k); }     // (a tangent is only for a normal map)
  if (p.indices != null) q.indices = accessor(p.indices, 'INDEX');
  if (p.targets) q.targets = p.targets.map(t => Object.fromEntries(Object.entries(t).map(([k, a]) => [k, accessor(a, 'morph')])));
  return q; }), ...(m.weights ? { weights: m.weights } : {}), ...(m.extras ? { extras: m.extras } : {}) }));
out.skins = (J.skins || []).map(s => ({ ...s, inverseBindMatrices: accessor(s.inverseBindMatrices, 'ibm') }));
out.animations = (J.animations || []).filter(a => !DROP.test(a.name)).map(a => {
  const sm = a.samplers.map(s => ({ input: accessor(s.input, 'anim-in'), output: accessor(s.output, 'anim'), interpolation: s.interpolation }));
  return { name: a.name, samplers: sm, channels: a.channels };
});
// images: out of the binary, down to 2048 px (JPEG stays JPEG at q 82)
out.images = J.images.map((im, i) => {
  const V = J.bufferViews[im.bufferView], raw = BIN.subarray(V.byteOffset || 0, (V.byteOffset || 0) + V.byteLength), ext = im.mimeType === 'image/png' ? 'png' : 'jpg', f = join(TMP, `i${i}.${ext}`), g = join(TMP, `o${i}.${ext}`);
  writeFileSync(f, raw);
  const args = ['-Z', '2048']; if (ext === 'jpg') args.push('-s', 'formatOptions', '82');
  execFileSync('sips', [...args, f, '--out', g], { stdio: 'ignore' });
  return { name: im.name, mimeType: im.mimeType, bufferView: put(readFileSync(g)) };
});
out.accessors = accs; out.bufferViews = views;
const bin = Buffer.concat(chunks), binPad = Buffer.concat([bin, Buffer.alloc((4 - bin.length % 4) % 4)]); out.buffers = [{ byteLength: binPad.length }];
let js = Buffer.from(JSON.stringify(out)); js = Buffer.concat([js, Buffer.alloc((4 - js.length % 4) % 4, 0x20)]);
const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + binPad.length, 8);
const c0 = Buffer.alloc(8); c0.writeUInt32LE(js.length, 0); c0.writeUInt32LE(0x4e4f534a, 4); const c1 = Buffer.alloc(8); c1.writeUInt32LE(binPad.length, 0); c1.writeUInt32LE(0x004e4942, 4);
writeFileSync(OUT, Buffer.concat([head, c0, js, c1, binPad]));
console.log(`${OUT}: ${(12 + 16 + js.length + binPad.length) / 1e6} MB, ${out.meshes.length} meshes, ${out.animations.length} clips: ${out.animations.map(a => a.name).join(' ')}`);
